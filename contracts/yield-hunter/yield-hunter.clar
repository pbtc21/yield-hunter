;; Yield Hunter - Core Agent Contract
;; Autonomous yield-hunting AI agent for AIBTC on Stacks Bitcoin L2
;;
;; Integrates with:
;; - aibtc-agent-account.clar (smart wallet)
;; - bitcoin-agents.clar (Tamagotchi lifecycle)
;; - ERC-8004 registries (identity/reputation)
;; - Bitflow XYK pools (yield sources)

;; ============================================
;; TRAITS
;; ============================================

(use-trait xyk-pool-trait .xyk-pool-trait.xyk-pool-trait)
(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes
(define-constant ERR_NOT_AUTHORIZED (err u1001))
(define-constant ERR_ALREADY_INITIALIZED (err u1002))
(define-constant ERR_NOT_INITIALIZED (err u1003))
(define-constant ERR_AGENT_DEAD (err u1004))
(define-constant ERR_HEALTH_TOO_LOW (err u1005))
(define-constant ERR_RISK_TOO_HIGH (err u1006))
(define-constant ERR_POSITION_NOT_FOUND (err u1007))
(define-constant ERR_INSUFFICIENT_BALANCE (err u1008))
(define-constant ERR_SLIPPAGE_EXCEEDED (err u1009))
(define-constant ERR_MAX_POSITIONS_REACHED (err u1010))
(define-constant ERR_POSITION_TOO_LARGE (err u1011))
(define-constant ERR_INVALID_POOL (err u1012))

;; Lifecycle thresholds
(define-constant MIN_HEALTH_TO_HUNT u20)           ;; 20% health minimum to hunt
(define-constant XP_PER_SUCCESSFUL_YIELD u100)     ;; XP reward for yields
(define-constant XP_PER_COMPOUND u25)              ;; XP for compounding
(define-constant DEATH_YIELD_THRESHOLD u10)        ;; Die if APY < 0.1% for extended period
(define-constant DEATH_CHECK_PERIOD u4320)         ;; 30 days in blocks (~144 blocks/day)
(define-constant MAX_DRAWDOWN_BPS u5000)           ;; 50% max loss triggers death

;; Risk parameters
(define-constant MAX_POSITION_SIZE_BPS u2500)      ;; Max 25% per position
(define-constant MIN_LIQUIDITY_THRESHOLD u100000000) ;; 1 sBTC (10^8 sats)
(define-constant MAX_SLIPPAGE_BPS u300)            ;; 3% max slippage
(define-constant MAX_POSITIONS u10)                ;; Max concurrent positions

;; Scale for fixed-point math (8 decimals like sBTC)
(define-constant SCALE u100000000)
(define-constant BPS_SCALE u10000)

;; sBTC contract reference
(define-constant SBTC_TOKEN .sbtc-token)

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var next-position-id uint u1)
(define-data-var total-hunters uint u0)
(define-data-var total-yields-distributed uint u0)

;; Governance - Contract administrator for pool approvals
;; SECURITY: Only this address can approve/revoke pools
(define-data-var contract-admin principal tx-sender)

;; ============================================
;; DATA MAPS
;; ============================================

;; Hunter state: agent-account -> state
(define-map hunters
  principal
  {
    owner: principal,
    agent: principal,
    bitcoin-agent-id: uint,
    identity-id: uint,
    initialized-at: uint,
    total-invested: uint,
    total-yields-earned: uint,
    total-positions-opened: uint,
    total-positions-closed: uint,
    last-hunt-block: uint,
    last-profitable-block: uint,
    peak-portfolio-value: uint,
    alive: bool,
    strategy-config: {
      min-apy-threshold: uint,
      max-risk-score: uint,
      auto-compound: bool,
      rebalance-threshold-bps: uint
    }
  }
)

;; Yield positions
(define-map positions
  uint  ;; position-id
  {
    hunter: principal,
    pool-contract: principal,
    token-x: principal,
    token-y: principal,
    amount-invested: uint,
    lp-tokens-held: uint,
    entry-block: uint,
    entry-price-x: uint,
    entry-price-y: uint,
    last-compound-block: uint,
    risk-score: uint,
    active: bool
  }
)

;; Hunter -> position IDs
(define-map hunter-positions
  principal
  (list 10 uint)
)

;; Approved pools for yield hunting
(define-map approved-pools
  principal
  {
    token-x: principal,
    token-y: principal,
    min-liquidity: uint,
    max-risk-score: uint,
    approved-at: uint
  }
)

;; ============================================
;; AUTHORIZATION
;; ============================================

(define-private (is-owner-or-agent (hunter-account principal))
  (let ((hunter-data (unwrap! (map-get? hunters hunter-account) false)))
    (or
      (is-eq tx-sender (get owner hunter-data))
      (is-eq tx-sender (get agent hunter-data))
    )
  )
)

(define-private (is-hunter-alive (hunter-account principal))
  (let ((hunter-data (unwrap! (map-get? hunters hunter-account) false)))
    (get alive hunter-data)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - INITIALIZATION
;; ============================================

;; Initialize a new yield hunter
(define-public (initialize-hunter
    (agent-account principal)
    (owner principal)
    (agent principal)
    (bitcoin-agent-id uint)
    (identity-id uint)
    (min-apy-threshold uint)
    (max-risk-score uint)
    (auto-compound bool)
    (rebalance-threshold-bps uint)
  )
  (begin
    ;; Only owner can initialize
    (asserts! (is-eq tx-sender owner) ERR_NOT_AUTHORIZED)
    ;; Can't initialize twice
    (asserts! (is-none (map-get? hunters agent-account)) ERR_ALREADY_INITIALIZED)

    ;; Create hunter state
    (map-set hunters agent-account {
      owner: owner,
      agent: agent,
      bitcoin-agent-id: bitcoin-agent-id,
      identity-id: identity-id,
      initialized-at: block-height,
      total-invested: u0,
      total-yields-earned: u0,
      total-positions-opened: u0,
      total-positions-closed: u0,
      last-hunt-block: block-height,
      last-profitable-block: block-height,
      peak-portfolio-value: u0,
      alive: true,
      strategy-config: {
        min-apy-threshold: min-apy-threshold,
        max-risk-score: max-risk-score,
        auto-compound: auto-compound,
        rebalance-threshold-bps: rebalance-threshold-bps
      }
    })

    ;; Initialize empty position list
    (map-set hunter-positions agent-account (list))

    ;; Increment total hunters
    (var-set total-hunters (+ (var-get total-hunters) u1))

    ;; Emit event
    (print {
      notification: "yield-hunter/HunterInitialized",
      payload: {
        agent-account: agent-account,
        owner: owner,
        agent: agent,
        bitcoin-agent-id: bitcoin-agent-id,
        identity-id: identity-id,
        block: block-height
      }
    })

    (ok true)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - YIELD HUNTING
;; ============================================

;; Hunt yield: Invest in a pool
(define-public (hunt-yield
    (hunter-account principal)
    (pool <xyk-pool-trait>)
    (amount uint)
    (min-lp-tokens uint)
    (risk-score uint)
  )
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
    (pool-principal (contract-of pool))
    (position-id (var-get next-position-id))
    (current-positions (default-to (list) (map-get? hunter-positions hunter-account)))
  )
    ;; Authorization checks
    (asserts! (is-owner-or-agent hunter-account) ERR_NOT_AUTHORIZED)
    (asserts! (get alive hunter-data) ERR_AGENT_DEAD)

    ;; Risk checks
    (asserts! (<= risk-score (get max-risk-score (get strategy-config hunter-data))) ERR_RISK_TOO_HIGH)
    (asserts! (< (len current-positions) MAX_POSITIONS) ERR_MAX_POSITIONS_REACHED)

    ;; Position size check (max 25% of total invested + new amount)
    (let ((total-value (+ (get total-invested hunter-data) amount)))
      (asserts! (<= (* amount BPS_SCALE) (* total-value MAX_POSITION_SIZE_BPS)) ERR_POSITION_TOO_LARGE)
    )

    ;; Transfer sBTC from hunter-account to this contract
    ;; Note: In production, this would go through agent-account's as-contract
    (try! (contract-call? .sbtc-token transfer amount hunter-account (as-contract tx-sender) none))

    ;; Add liquidity to pool (single-sided for simplicity)
    ;; In production, would use the adapter for proper liquidity addition
    (let ((lp-received (try! (contract-call? pool add-liquidity amount u0 (some min-lp-tokens)))))

      ;; Verify slippage
      (asserts! (>= lp-received min-lp-tokens) ERR_SLIPPAGE_EXCEEDED)

      ;; Record position
      (map-set positions position-id {
        hunter: hunter-account,
        pool-contract: pool-principal,
        token-x: SBTC_TOKEN,
        token-y: SBTC_TOKEN, ;; Simplified; would be actual token-y
        amount-invested: amount,
        lp-tokens-held: lp-received,
        entry-block: block-height,
        entry-price-x: SCALE, ;; Simplified; would be actual price
        entry-price-y: SCALE,
        last-compound-block: block-height,
        risk-score: risk-score,
        active: true
      })

      ;; Update hunter positions list
      (map-set hunter-positions hunter-account
        (unwrap! (as-max-len? (append current-positions position-id) u10) ERR_MAX_POSITIONS_REACHED)
      )

      ;; Update hunter state
      (map-set hunters hunter-account
        (merge hunter-data {
          total-invested: (+ (get total-invested hunter-data) amount),
          total-positions-opened: (+ (get total-positions-opened hunter-data) u1),
          last-hunt-block: block-height,
          peak-portfolio-value: (if (> (+ (get total-invested hunter-data) amount) (get peak-portfolio-value hunter-data))
            (+ (get total-invested hunter-data) amount)
            (get peak-portfolio-value hunter-data)
          )
        })
      )

      ;; Increment position counter
      (var-set next-position-id (+ position-id u1))

      ;; Emit event
      (print {
        notification: "yield-hunter/YieldHunted",
        payload: {
          hunter: hunter-account,
          position-id: position-id,
          pool: pool-principal,
          amount: amount,
          lp-tokens: lp-received,
          risk-score: risk-score,
          block: block-height
        }
      })

      (ok position-id)
    )
  )
)

;; Compound yields back into position
(define-public (compound-yields
    (hunter-account principal)
    (position-id uint)
    (pool <xyk-pool-trait>)
  )
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
    (position-data (unwrap! (map-get? positions position-id) ERR_POSITION_NOT_FOUND))
  )
    ;; Authorization checks
    (asserts! (is-owner-or-agent hunter-account) ERR_NOT_AUTHORIZED)
    (asserts! (get alive hunter-data) ERR_AGENT_DEAD)
    (asserts! (get active position-data) ERR_POSITION_NOT_FOUND)
    (asserts! (is-eq (get hunter position-data) hunter-account) ERR_NOT_AUTHORIZED)

    ;; Get pending rewards (simplified - would query actual pool rewards)
    ;; In production, this would claim fees/rewards from the pool
    (let (
      (rewards u0) ;; Placeholder - actual implementation would get real rewards
    )
      ;; If auto-compound enabled and rewards > dust threshold
      (if (and
            (get auto-compound (get strategy-config hunter-data))
            (> rewards u1000) ;; Min 1000 sats to compound
          )
        (begin
          ;; Reinvest rewards
          (let ((additional-lp (try! (contract-call? pool add-liquidity rewards u0 none))))

            ;; Update position
            (map-set positions position-id
              (merge position-data {
                amount-invested: (+ (get amount-invested position-data) rewards),
                lp-tokens-held: (+ (get lp-tokens-held position-data) additional-lp),
                last-compound-block: block-height
              })
            )

            ;; Update hunter state
            (map-set hunters hunter-account
              (merge hunter-data {
                total-yields-earned: (+ (get total-yields-earned hunter-data) rewards),
                last-profitable-block: block-height
              })
            )

            ;; Update global stats
            (var-set total-yields-distributed (+ (var-get total-yields-distributed) rewards))

            ;; Emit event
            (print {
              notification: "yield-hunter/YieldsCompounded",
              payload: {
                hunter: hunter-account,
                position-id: position-id,
                rewards: rewards,
                additional-lp: additional-lp,
                block: block-height
              }
            })

            (ok rewards)
          )
        )
        (ok u0)
      )
    )
  )
)

;; Exit a yield position
(define-public (exit-position
    (hunter-account principal)
    (position-id uint)
    (pool <xyk-pool-trait>)
    (min-receive uint)
  )
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
    (position-data (unwrap! (map-get? positions position-id) ERR_POSITION_NOT_FOUND))
  )
    ;; Authorization checks
    (asserts! (is-owner-or-agent hunter-account) ERR_NOT_AUTHORIZED)
    (asserts! (get active position-data) ERR_POSITION_NOT_FOUND)
    (asserts! (is-eq (get hunter position-data) hunter-account) ERR_NOT_AUTHORIZED)

    ;; Remove liquidity
    (let (
      (lp-amount (get lp-tokens-held position-data))
      (withdrawn (try! (contract-call? pool remove-liquidity lp-amount (some min-receive) none)))
      (received-x (get x withdrawn))
    )
      ;; Verify slippage
      (asserts! (>= received-x min-receive) ERR_SLIPPAGE_EXCEEDED)

      ;; Transfer sBTC back to hunter-account
      (try! (as-contract (contract-call? .sbtc-token transfer received-x tx-sender hunter-account none)))

      ;; Calculate profit/loss
      (let (
        (invested (get amount-invested position-data))
        (profit (if (> received-x invested) (- received-x invested) u0))
        (loss (if (< received-x invested) (- invested received-x) u0))
      )
        ;; Mark position as inactive
        (map-set positions position-id
          (merge position-data {
            active: false,
            lp-tokens-held: u0
          })
        )

        ;; Update hunter state
        (map-set hunters hunter-account
          (merge hunter-data {
            total-invested: (- (get total-invested hunter-data) invested),
            total-yields-earned: (+ (get total-yields-earned hunter-data) profit),
            total-positions-closed: (+ (get total-positions-closed hunter-data) u1),
            last-profitable-block: (if (> profit u0) block-height (get last-profitable-block hunter-data))
          })
        )

        ;; Emit event
        (print {
          notification: "yield-hunter/PositionExited",
          payload: {
            hunter: hunter-account,
            position-id: position-id,
            invested: invested,
            received: received-x,
            profit: profit,
            loss: loss,
            block: block-height
          }
        })

        (ok received-x)
      )
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - DEATH CONDITIONS
;; ============================================

;; Check and process death conditions
(define-public (check-hunt-death (hunter-account principal))
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
  )
    ;; Skip if already dead
    (asserts! (get alive hunter-data) ERR_AGENT_DEAD)

    (let (
      (blocks-since-profit (- block-height (get last-profitable-block hunter-data)))
      (current-value (get total-invested hunter-data))
      (peak-value (get peak-portfolio-value hunter-data))
      (drawdown-bps (if (> peak-value u0)
        (/ (* (- peak-value current-value) BPS_SCALE) peak-value)
        u0
      ))
    )
      ;; Death condition 1: Prolonged unprofitable period
      (if (> blocks-since-profit DEATH_CHECK_PERIOD)
        (process-death hunter-account "poor-performance")

        ;; Death condition 2: Catastrophic drawdown
        (if (> drawdown-bps MAX_DRAWDOWN_BPS)
          (process-death hunter-account "catastrophic-loss")

          ;; Still alive
          (ok false)
        )
      )
    )
  )
)

;; Process death (internal)
(define-private (process-death (hunter-account principal) (cause (string-ascii 32)))
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
  )
    ;; Mark as dead
    (map-set hunters hunter-account
      (merge hunter-data {
        alive: false
      })
    )

    ;; Emit death event
    (print {
      notification: "yield-hunter/HunterDied",
      payload: {
        hunter: hunter-account,
        cause: cause,
        total-invested: (get total-invested hunter-data),
        total-yields-earned: (get total-yields-earned hunter-data),
        positions-opened: (get total-positions-opened hunter-data),
        positions-closed: (get total-positions-closed hunter-data),
        lifespan-blocks: (- block-height (get initialized-at hunter-data)),
        block: block-height
      }
    })

    (ok true)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - CONFIGURATION
;; ============================================

;; Update strategy config
(define-public (update-strategy
    (hunter-account principal)
    (min-apy-threshold uint)
    (max-risk-score uint)
    (auto-compound bool)
    (rebalance-threshold-bps uint)
  )
  (let (
    (hunter-data (unwrap! (map-get? hunters hunter-account) ERR_NOT_INITIALIZED))
  )
    ;; Only owner can update
    (asserts! (is-eq tx-sender (get owner hunter-data)) ERR_NOT_AUTHORIZED)

    (map-set hunters hunter-account
      (merge hunter-data {
        strategy-config: {
          min-apy-threshold: min-apy-threshold,
          max-risk-score: max-risk-score,
          auto-compound: auto-compound,
          rebalance-threshold-bps: rebalance-threshold-bps
        }
      })
    )

    (print {
      notification: "yield-hunter/StrategyUpdated",
      payload: {
        hunter: hunter-account,
        min-apy-threshold: min-apy-threshold,
        max-risk-score: max-risk-score,
        auto-compound: auto-compound,
        rebalance-threshold-bps: rebalance-threshold-bps
      }
    })

    (ok true)
  )
)

;; Approve a pool for hunting
;; SECURITY: Only contract admin can approve pools
(define-public (approve-pool
    (pool-contract principal)
    (token-x principal)
    (token-y principal)
    (min-liquidity uint)
    (max-risk-score uint)
  )
  (begin
    ;; CRITICAL: Only admin can approve pools
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_NOT_AUTHORIZED)

    (map-set approved-pools pool-contract {
      token-x: token-x,
      token-y: token-y,
      min-liquidity: min-liquidity,
      max-risk-score: max-risk-score,
      approved-at: block-height
    })

    (print {
      notification: "yield-hunter/PoolApproved",
      payload: {
        pool: pool-contract,
        token-x: token-x,
        token-y: token-y,
        min-liquidity: min-liquidity,
        max-risk-score: max-risk-score
      }
    })

    (ok true)
  )
)

;; Revoke pool approval
;; SECURITY: Only contract admin can revoke pools
(define-public (revoke-pool (pool-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_NOT_AUTHORIZED)
    (map-delete approved-pools pool-contract)

    (print {
      notification: "yield-hunter/PoolRevoked",
      payload: { pool: pool-contract }
    })

    (ok true)
  )
)

;; Transfer admin role
;; SECURITY: Only current admin can transfer role
(define-public (set-contract-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_NOT_AUTHORIZED)
    (var-set contract-admin new-admin)

    (print {
      notification: "yield-hunter/AdminTransferred",
      payload: { old-admin: tx-sender, new-admin: new-admin }
    })

    (ok true)
  )
)

;; Get current admin
(define-read-only (get-contract-admin)
  (var-get contract-admin)
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-hunter (hunter-account principal))
  (map-get? hunters hunter-account)
)

(define-read-only (get-position (position-id uint))
  (map-get? positions position-id)
)

(define-read-only (get-hunter-positions (hunter-account principal))
  (default-to (list) (map-get? hunter-positions hunter-account))
)

(define-read-only (get-approved-pool (pool-contract principal))
  (map-get? approved-pools pool-contract)
)

(define-read-only (get-stats)
  {
    total-hunters: (var-get total-hunters),
    total-yields-distributed: (var-get total-yields-distributed),
    next-position-id: (var-get next-position-id)
  }
)

(define-read-only (is-pool-approved (pool-contract principal))
  (is-some (map-get? approved-pools pool-contract))
)

;; Calculate portfolio value (simplified)
(define-read-only (get-portfolio-value (hunter-account principal))
  (let ((hunter-data (map-get? hunters hunter-account)))
    (match hunter-data
      data (get total-invested data)
      u0
    )
  )
)

;; Check if hunter is healthy enough to hunt
(define-read-only (can-hunt (hunter-account principal))
  (let ((hunter-data (map-get? hunters hunter-account)))
    (match hunter-data
      data (and
        (get alive data)
        (< (len (default-to (list) (map-get? hunter-positions hunter-account))) MAX_POSITIONS)
      )
      false
    )
  )
)
