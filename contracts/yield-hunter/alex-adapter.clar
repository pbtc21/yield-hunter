;; ALEX Adapter
;; Integration with ALEX Protocol for lending and yield farming
;;
;; ALEX is the largest DeFi protocol on Stacks
;; Supports: Lending, Yield Farming, Orderbook DEX

(impl-trait .adapter-trait.yield-adapter-trait)
(impl-trait .adapter-trait.lending-adapter-trait)

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR_NOT_AUTHORIZED (err u3001))
(define-constant ERR_MARKET_NOT_FOUND (err u3002))
(define-constant ERR_INSUFFICIENT_COLLATERAL (err u3003))
(define-constant ERR_HEALTH_FACTOR_TOO_LOW (err u3004))
(define-constant ERR_INVALID_AMOUNT (err u3005))
(define-constant ERR_POSITION_NOT_FOUND (err u3006))
(define-constant ERR_BORROW_LIMIT_EXCEEDED (err u3007))

;; ALEX contract references (mainnet)
(define-constant ALEX_VAULT 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.alex-vault)
(define-constant ALEX_RESERVE_POOL 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.alex-reserve-pool)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

;; Scale factors
(define-constant SCALE u100000000)  ;; 1e8
(define-constant BPS_SCALE u10000)
(define-constant HEALTH_SCALE u100000000)  ;; 1e8 for health factor

;; Default parameters
(define-constant DEFAULT_COLLATERAL_FACTOR u7500)  ;; 75%
(define-constant MIN_HEALTH_FACTOR u105000000)     ;; 1.05 (5% buffer)
(define-constant LIQUIDATION_THRESHOLD u8000)      ;; 80%

;; ============================================
;; DATA MAPS
;; ============================================

;; User lending positions
(define-map lending-positions
  { user: principal, token: principal }
  {
    supplied: uint,
    borrowed: uint,
    collateral-factor: uint,
    entry-block: uint,
    last-update-block: uint
  }
)

;; Market info cache
(define-map market-cache
  principal  ;; token
  {
    total-supply: uint,
    total-borrow: uint,
    supply-rate: uint,      ;; APY in BPS
    borrow-rate: uint,      ;; APY in BPS
    collateral-factor: uint, ;; BPS
    utilization: uint,       ;; BPS
    last-updated: uint
  }
)

;; Yield farming positions
(define-map farm-positions
  { user: principal, farm-id: uint }
  {
    staked: uint,
    pending-rewards: uint,
    entry-block: uint
  }
)

;; ============================================
;; YIELD ADAPTER IMPLEMENTATION
;; ============================================

(define-public (get-adapter-info)
  (ok {
    name: "ALEX Protocol",
    protocol: "ALEX",
    version: "2.0.0",
    supported-tokens: (list
      SBTC_TOKEN
      'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx
      'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex
    )
  })
)

(define-public (get-expected-apy (token principal) (amount uint))
  (let (
    (market (map-get? market-cache token))
  )
    (match market
      data (ok (get supply-rate data))
      (ok u500)  ;; Default 5% if no data
    )
  )
)

(define-public (calculate-risk-score (token principal) (amount uint))
  (let (
    (market (map-get? market-cache token))
  )
    (match market
      data (ok (calculate-lending-risk
        (get utilization data)
        (get total-supply data)
        amount
      ))
      (ok u40)  ;; Default medium-low risk
    )
  )
)

(define-public (enter-position (token principal) (amount uint) (min-receipt uint))
  ;; For ALEX, "entering position" = supplying collateral
  (supply-collateral token amount)
)

(define-public (exit-position (token principal) (amount uint) (min-receive uint))
  ;; For ALEX, "exiting position" = withdrawing collateral
  (withdraw-collateral token amount)
)

(define-public (claim-rewards (token principal))
  ;; Claim ALEX token rewards from lending
  ;; In production: call ALEX rewards contract
  (let (
    (position (map-get? lending-positions { user: tx-sender, token: token }))
  )
    (match position
      data (let (
        (blocks-elapsed (- block-height (get last-update-block data)))
        (rewards (calculate-pending-rewards (get supplied data) blocks-elapsed))
      )
        ;; Update position
        (map-set lending-positions
          { user: tx-sender, token: token }
          (merge data { last-update-block: block-height })
        )

        (print {
          notification: "alex-adapter/RewardsClaimed",
          payload: {
            user: tx-sender,
            token: token,
            rewards: rewards
          }
        })

        (ok rewards)
      )
      (ok u0)
    )
  )
)

(define-public (get-position-value (token principal))
  (let (
    (position (map-get? lending-positions { user: tx-sender, token: token }))
  )
    (match position
      data (ok (get supplied data))
      (ok u0)
    )
  )
)

;; ============================================
;; LENDING ADAPTER IMPLEMENTATION
;; ============================================

(define-public (supply-collateral (token principal) (amount uint))
  (let (
    (existing (map-get? lending-positions { user: tx-sender, token: token }))
    (market (default-to {
      total-supply: u0,
      total-borrow: u0,
      supply-rate: u500,
      borrow-rate: u800,
      collateral-factor: DEFAULT_COLLATERAL_FACTOR,
      utilization: u0,
      last-updated: block-height
    } (map-get? market-cache token)))
  )
    ;; In production: transfer tokens to ALEX vault
    ;; (contract-call? token transfer amount tx-sender ALEX_VAULT none)

    ;; Update or create position
    (match existing
      data (map-set lending-positions
        { user: tx-sender, token: token }
        (merge data {
          supplied: (+ (get supplied data) amount),
          last-update-block: block-height
        })
      )
      (map-set lending-positions
        { user: tx-sender, token: token }
        {
          supplied: amount,
          borrowed: u0,
          collateral-factor: (get collateral-factor market),
          entry-block: block-height,
          last-update-block: block-height
        }
      )
    )

    (print {
      notification: "alex-adapter/CollateralSupplied",
      payload: {
        user: tx-sender,
        token: token,
        amount: amount
      }
    })

    (ok amount)
  )
)

(define-public (withdraw-collateral (token principal) (amount uint))
  (let (
    (position (unwrap! (map-get? lending-positions { user: tx-sender, token: token }) ERR_POSITION_NOT_FOUND))
  )
    (asserts! (>= (get supplied position) amount) ERR_INVALID_AMOUNT)

    ;; Check health factor after withdrawal
    (let (
      (new-supplied (- (get supplied position) amount))
      (borrowed (get borrowed position))
      (new-health (calculate-health-internal new-supplied borrowed (get collateral-factor position)))
    )
      (asserts! (or (is-eq borrowed u0) (>= new-health MIN_HEALTH_FACTOR)) ERR_HEALTH_FACTOR_TOO_LOW)

      ;; In production: withdraw from ALEX vault
      ;; Update position
      (if (is-eq new-supplied u0)
        (map-delete lending-positions { user: tx-sender, token: token })
        (map-set lending-positions
          { user: tx-sender, token: token }
          (merge position {
            supplied: new-supplied,
            last-update-block: block-height
          })
        )
      )

      (print {
        notification: "alex-adapter/CollateralWithdrawn",
        payload: {
          user: tx-sender,
          token: token,
          amount: amount
        }
      })

      (ok amount)
    )
  )
)

(define-public (borrow (token principal) (amount uint))
  (let (
    (position (unwrap! (map-get? lending-positions { user: tx-sender, token: token }) ERR_POSITION_NOT_FOUND))
    (max-borrow (calculate-max-borrow (get supplied position) (get collateral-factor position)))
    (new-borrowed (+ (get borrowed position) amount))
  )
    (asserts! (<= new-borrowed max-borrow) ERR_BORROW_LIMIT_EXCEEDED)

    ;; Check health factor
    (let (
      (new-health (calculate-health-internal (get supplied position) new-borrowed (get collateral-factor position)))
    )
      (asserts! (>= new-health MIN_HEALTH_FACTOR) ERR_HEALTH_FACTOR_TOO_LOW)

      ;; In production: borrow from ALEX reserve pool
      ;; Update position
      (map-set lending-positions
        { user: tx-sender, token: token }
        (merge position {
          borrowed: new-borrowed,
          last-update-block: block-height
        })
      )

      (print {
        notification: "alex-adapter/Borrowed",
        payload: {
          user: tx-sender,
          token: token,
          amount: amount,
          total-borrowed: new-borrowed
        }
      })

      (ok amount)
    )
  )
)

(define-public (repay (token principal) (amount uint))
  (let (
    (position (unwrap! (map-get? lending-positions { user: tx-sender, token: token }) ERR_POSITION_NOT_FOUND))
    (actual-repay (if (> amount (get borrowed position)) (get borrowed position) amount))
  )
    ;; In production: repay to ALEX reserve pool
    ;; Update position
    (map-set lending-positions
      { user: tx-sender, token: token }
      (merge position {
        borrowed: (- (get borrowed position) actual-repay),
        last-update-block: block-height
      })
    )

    (print {
      notification: "alex-adapter/Repaid",
      payload: {
        user: tx-sender,
        token: token,
        amount: actual-repay
      }
    })

    (ok actual-repay)
  )
)

(define-public (get-collateral-factor (token principal))
  (let (
    (market (map-get? market-cache token))
  )
    (match market
      data (ok (get collateral-factor data))
      (ok DEFAULT_COLLATERAL_FACTOR)
    )
  )
)

(define-public (get-borrow-rate (token principal))
  (let (
    (market (map-get? market-cache token))
  )
    (match market
      data (ok (get borrow-rate data))
      (ok u800)  ;; Default 8%
    )
  )
)

(define-public (get-supply-rate (token principal))
  (let (
    (market (map-get? market-cache token))
  )
    (match market
      data (ok (get supply-rate data))
      (ok u500)  ;; Default 5%
    )
  )
)

(define-public (get-health-factor (user principal))
  (let (
    ;; Get all positions for user (simplified - would iterate in production)
    (position (map-get? lending-positions { user: user, token: SBTC_TOKEN }))
  )
    (match position
      data (ok (calculate-health-internal
        (get supplied data)
        (get borrowed data)
        (get collateral-factor data)
      ))
      (ok HEALTH_SCALE)  ;; Healthy if no position
    )
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

(define-private (calculate-lending-risk (utilization uint) (total-supply uint) (amount uint))
  ;; Risk score 0-100 based on:
  ;; - Market utilization (higher = riskier)
  ;; - Position size relative to market
  ;; - Protocol risk
  (let (
    (util-risk (/ utilization u100))         ;; utilization / 100
    (size-risk (if (> total-supply u0)
      (/ (* amount u100) total-supply)
      u50
    ))
  )
    (/ (+ (* util-risk u60) (* size-risk u40)) u100)
  )
)

(define-private (calculate-health-internal (supplied uint) (borrowed uint) (collateral-factor uint))
  ;; Health factor = (supplied * collateral_factor) / borrowed
  ;; Returns 1e8 scale (1.0 = 100000000)
  (if (is-eq borrowed u0)
    HEALTH_SCALE  ;; Infinite health if no borrows
    (/ (* supplied collateral-factor HEALTH_SCALE) (* borrowed BPS_SCALE))
  )
)

(define-private (calculate-max-borrow (supplied uint) (collateral-factor uint))
  ;; Max borrow = supplied * collateral_factor / 10000
  (/ (* supplied collateral-factor) BPS_SCALE)
)

(define-private (calculate-pending-rewards (supplied uint) (blocks uint))
  ;; Simplified reward calculation
  ;; In production: query actual pending rewards from ALEX
  (/ (* (* supplied blocks) u10) (* u144 SCALE))  ;; ~10 basis points per day
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-lending-position (user principal) (token principal))
  (map-get? lending-positions { user: user, token: token })
)

(define-read-only (get-market-info (token principal))
  (map-get? market-cache token)
)

(define-read-only (get-max-borrow (user principal) (token principal))
  (let (
    (position (map-get? lending-positions { user: user, token: token }))
  )
    (match position
      data (- (calculate-max-borrow (get supplied data) (get collateral-factor data)) (get borrowed data))
      u0
    )
  )
)

(define-read-only (is-healthy (user principal) (token principal))
  (let (
    (position (map-get? lending-positions { user: user, token: token }))
  )
    (match position
      data (>= (calculate-health-internal
        (get supplied data)
        (get borrowed data)
        (get collateral-factor data)
      ) MIN_HEALTH_FACTOR)
      true
    )
  )
)
