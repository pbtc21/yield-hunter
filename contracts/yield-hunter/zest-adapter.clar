;; Zest Adapter
;; Integration with Zest Protocol for Bitcoin lending/borrowing
;;
;; Zest enables Bitcoin-backed lending on Stacks
;; Users can lend BTC to earn yield or borrow against BTC collateral

(impl-trait .adapter-trait.yield-adapter-trait)
(impl-trait .adapter-trait.lending-adapter-trait)

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR_NOT_AUTHORIZED (err u5001))
(define-constant ERR_POOL_NOT_FOUND (err u5002))
(define-constant ERR_INSUFFICIENT_COLLATERAL (err u5003))
(define-constant ERR_HEALTH_FACTOR_TOO_LOW (err u5004))
(define-constant ERR_INVALID_AMOUNT (err u5005))
(define-constant ERR_POSITION_NOT_FOUND (err u5006))
(define-constant ERR_BORROW_LIMIT_EXCEEDED (err u5007))
(define-constant ERR_POOL_PAUSED (err u5008))

;; Zest contract references (mainnet)
(define-constant ZEST_POOL 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zest-pool-v1)
(define-constant ZEST_REWARDS 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zest-rewards-v1)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ZUSDT_TOKEN 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusdt)

;; Scale factors
(define-constant SCALE u100000000)  ;; 1e8
(define-constant BPS_SCALE u10000)
(define-constant HEALTH_SCALE u100000000)  ;; 1e8

;; Pool parameters
(define-constant DEFAULT_COLLATERAL_FACTOR u7000)  ;; 70% LTV
(define-constant LIQUIDATION_THRESHOLD u8500)      ;; 85% liquidation
(define-constant MIN_HEALTH_FACTOR u110000000)     ;; 1.10 minimum
(define-constant BASE_SUPPLY_RATE u400)            ;; 4% base APY
(define-constant BASE_BORROW_RATE u600)            ;; 6% base APY
(define-constant OPTIMAL_UTILIZATION u8000)        ;; 80% target utilization

;; ============================================
;; DATA MAPS
;; ============================================

;; Lending positions
(define-map lend-positions
  { user: principal, pool-id: uint }
  {
    principal-lent: uint,
    interest-earned: uint,
    entry-block: uint,
    last-update-block: uint
  }
)

;; Borrow positions
(define-map borrow-positions
  { user: principal, pool-id: uint }
  {
    collateral: uint,
    borrowed: uint,
    interest-owed: uint,
    entry-block: uint,
    last-update-block: uint
  }
)

;; Pool state
(define-map pool-state
  uint  ;; pool-id
  {
    token: principal,
    total-supplied: uint,
    total-borrowed: uint,
    supply-rate: uint,
    borrow-rate: uint,
    collateral-factor: uint,
    paused: bool,
    last-update-block: uint
  }
)

;; Default pool ID for sBTC
(define-constant SBTC_POOL_ID u1)

;; ============================================
;; YIELD ADAPTER IMPLEMENTATION
;; ============================================

(define-public (get-adapter-info)
  (ok {
    name: "Zest Protocol",
    protocol: "Zest",
    version: "1.0.0",
    supported-tokens: (list
      SBTC_TOKEN
      ZUSDT_TOKEN
    )
  })
)

(define-public (get-expected-apy (pool principal) (amount uint))
  (let (
    (pool-data (get-pool-by-token pool))
  )
    (match pool-data
      data (ok (get supply-rate data))
      (ok BASE_SUPPLY_RATE)
    )
  )
)

(define-public (calculate-risk-score (pool principal) (amount uint))
  (let (
    (pool-data (get-pool-by-token pool))
  )
    (match pool-data
      data (ok (calculate-pool-risk-score
        (get total-supplied data)
        (get total-borrowed data)
        amount
      ))
      (ok u35)  ;; Default medium-low risk
    )
  )
)

(define-public (enter-position (pool principal) (amount uint) (min-receipt uint))
  ;; For Zest, entering = lending to pool
  (let (
    (pool-data (unwrap! (get-pool-by-token pool) ERR_POOL_NOT_FOUND))
    (pool-id (get-pool-id-by-token pool))
    (existing (map-get? lend-positions { user: tx-sender, pool-id: pool-id }))
  )
    (asserts! (not (get paused pool-data)) ERR_POOL_PAUSED)

    ;; In production: transfer tokens to Zest pool
    ;; (contract-call? pool transfer amount tx-sender ZEST_POOL none)

    ;; Update pool state
    (update-pool-state pool-id (+ (get total-supplied pool-data) amount) (get total-borrowed pool-data))

    ;; Update or create position
    (match existing
      data (map-set lend-positions { user: tx-sender, pool-id: pool-id }
        (merge data {
          principal-lent: (+ (get principal-lent data) amount),
          last-update-block: stacks-block-height
        })
      )
      (map-set lend-positions { user: tx-sender, pool-id: pool-id } {
        principal-lent: amount,
        interest-earned: u0,
        entry-block: stacks-block-height,
        last-update-block: stacks-block-height
      })
    )

    (print {
      notification: "zest-adapter/Lent",
      payload: {
        user: tx-sender,
        pool-id: pool-id,
        amount: amount
      }
    })

    (ok amount)
  )
)

(define-public (exit-position (pool principal) (amount uint) (min-receive uint))
  (let (
    (pool-id (get-pool-id-by-token pool))
    (position (unwrap! (map-get? lend-positions { user: tx-sender, pool-id: pool-id }) ERR_POSITION_NOT_FOUND))
    (pool-data (unwrap! (map-get? pool-state pool-id) ERR_POOL_NOT_FOUND))
  )
    (asserts! (>= (get principal-lent position) amount) ERR_INVALID_AMOUNT)

    ;; Calculate interest
    (let (
      (interest (calculate-lend-interest
        (get principal-lent position)
        (get supply-rate pool-data)
        (- stacks-block-height (get last-update-block position))
      ))
      (total-withdraw (+ amount interest))
    )
      (asserts! (>= total-withdraw min-receive) ERR_INVALID_AMOUNT)

      ;; In production: withdraw from Zest pool
      ;; Update pool state
      (update-pool-state pool-id (- (get total-supplied pool-data) amount) (get total-borrowed pool-data))

      ;; Update position
      (if (is-eq amount (get principal-lent position))
        (map-delete lend-positions { user: tx-sender, pool-id: pool-id })
        (map-set lend-positions { user: tx-sender, pool-id: pool-id }
          (merge position {
            principal-lent: (- (get principal-lent position) amount),
            interest-earned: (+ (get interest-earned position) interest),
            last-update-block: stacks-block-height
          })
        )
      )

      (print {
        notification: "zest-adapter/Withdrawn",
        payload: {
          user: tx-sender,
          pool-id: pool-id,
          principal: amount,
          interest: interest
        }
      })

      (ok total-withdraw)
    )
  )
)

(define-public (claim-rewards (pool principal))
  (let (
    (pool-id (get-pool-id-by-token pool))
    (position (map-get? lend-positions { user: tx-sender, pool-id: pool-id }))
    (pool-data (map-get? pool-state pool-id))
  )
    (match position
      pos (match pool-data
        pdata (let (
          (interest (calculate-lend-interest
            (get principal-lent pos)
            (get supply-rate pdata)
            (- stacks-block-height (get last-update-block pos))
          ))
        )
          ;; In production: claim ZEST rewards too
          (map-set lend-positions { user: tx-sender, pool-id: pool-id }
            (merge pos {
              interest-earned: (+ (get interest-earned pos) interest),
              last-update-block: stacks-block-height
            })
          )

          (print {
            notification: "zest-adapter/RewardsClaimed",
            payload: {
              user: tx-sender,
              pool-id: pool-id,
              interest: interest
            }
          })

          (ok interest)
        )
        (ok u0)
      )
      (ok u0)
    )
  )
)

(define-public (get-position-value (pool principal))
  (let (
    (pool-id (get-pool-id-by-token pool))
    (position (map-get? lend-positions { user: tx-sender, pool-id: pool-id }))
    (pool-data (map-get? pool-state pool-id))
  )
    (match position
      pos (match pool-data
        pdata (let (
          (interest (calculate-lend-interest
            (get principal-lent pos)
            (get supply-rate pdata)
            (- stacks-block-height (get last-update-block pos))
          ))
        )
          (ok (+ (get principal-lent pos) (get interest-earned pos) interest))
        )
        (ok (get principal-lent pos))
      )
      (ok u0)
    )
  )
)

;; ============================================
;; LENDING ADAPTER IMPLEMENTATION
;; ============================================

(define-public (supply-collateral (token principal) (amount uint))
  (let (
    (pool-id (get-pool-id-by-token token))
    (existing (map-get? borrow-positions { user: tx-sender, pool-id: pool-id }))
  )
    ;; In production: transfer to Zest
    ;; Update or create borrow position
    (match existing
      data (map-set borrow-positions { user: tx-sender, pool-id: pool-id }
        (merge data {
          collateral: (+ (get collateral data) amount),
          last-update-block: stacks-block-height
        })
      )
      (map-set borrow-positions { user: tx-sender, pool-id: pool-id } {
        collateral: amount,
        borrowed: u0,
        interest-owed: u0,
        entry-block: stacks-block-height,
        last-update-block: stacks-block-height
      })
    )

    (print {
      notification: "zest-adapter/CollateralSupplied",
      payload: { user: tx-sender, pool-id: pool-id, amount: amount }
    })

    (ok amount)
  )
)

(define-public (withdraw-collateral (token principal) (amount uint))
  (let (
    (pool-id (get-pool-id-by-token token))
    (position (unwrap! (map-get? borrow-positions { user: tx-sender, pool-id: pool-id }) ERR_POSITION_NOT_FOUND))
    (new-collateral (- (get collateral position) amount))
  )
    (asserts! (>= (get collateral position) amount) ERR_INVALID_AMOUNT)

    ;; Check health factor
    (let (
      (new-health (calculate-health new-collateral (get borrowed position)))
    )
      (asserts! (or (is-eq (get borrowed position) u0) (>= new-health MIN_HEALTH_FACTOR)) ERR_HEALTH_FACTOR_TOO_LOW)

      ;; In production: withdraw from Zest
      ;; Update position
      (if (and (is-eq new-collateral u0) (is-eq (get borrowed position) u0))
        (map-delete borrow-positions { user: tx-sender, pool-id: pool-id })
        (map-set borrow-positions { user: tx-sender, pool-id: pool-id }
          (merge position {
            collateral: new-collateral,
            last-update-block: stacks-block-height
          })
        )
      )

      (print {
        notification: "zest-adapter/CollateralWithdrawn",
        payload: { user: tx-sender, pool-id: pool-id, amount: amount }
      })

      (ok amount)
    )
  )
)

(define-public (borrow (token principal) (amount uint))
  (let (
    (pool-id (get-pool-id-by-token token))
    (position (unwrap! (map-get? borrow-positions { user: tx-sender, pool-id: pool-id }) ERR_POSITION_NOT_FOUND))
    (pool-data (unwrap! (map-get? pool-state pool-id) ERR_POOL_NOT_FOUND))
    (max-borrow (/ (* (get collateral position) DEFAULT_COLLATERAL_FACTOR) BPS_SCALE))
    (new-borrowed (+ (get borrowed position) amount))
  )
    (asserts! (not (get paused pool-data)) ERR_POOL_PAUSED)
    (asserts! (<= new-borrowed max-borrow) ERR_BORROW_LIMIT_EXCEEDED)

    ;; Check health
    (let (
      (new-health (calculate-health (get collateral position) new-borrowed))
    )
      (asserts! (>= new-health MIN_HEALTH_FACTOR) ERR_HEALTH_FACTOR_TOO_LOW)

      ;; In production: borrow from Zest
      ;; Update pool state
      (update-pool-state pool-id (get total-supplied pool-data) (+ (get total-borrowed pool-data) amount))

      ;; Update position
      (map-set borrow-positions { user: tx-sender, pool-id: pool-id }
        (merge position {
          borrowed: new-borrowed,
          last-update-block: stacks-block-height
        })
      )

      (print {
        notification: "zest-adapter/Borrowed",
        payload: { user: tx-sender, pool-id: pool-id, amount: amount, total: new-borrowed }
      })

      (ok amount)
    )
  )
)

(define-public (repay (token principal) (amount uint))
  (let (
    (pool-id (get-pool-id-by-token token))
    (position (unwrap! (map-get? borrow-positions { user: tx-sender, pool-id: pool-id }) ERR_POSITION_NOT_FOUND))
    (pool-data (unwrap! (map-get? pool-state pool-id) ERR_POOL_NOT_FOUND))
    (actual-repay (if (> amount (get borrowed position)) (get borrowed position) amount))
  )
    ;; In production: repay to Zest
    ;; Update pool state
    (update-pool-state pool-id (get total-supplied pool-data) (- (get total-borrowed pool-data) actual-repay))

    ;; Update position
    (map-set borrow-positions { user: tx-sender, pool-id: pool-id }
      (merge position {
        borrowed: (- (get borrowed position) actual-repay),
        last-update-block: stacks-block-height
      })
    )

    (print {
      notification: "zest-adapter/Repaid",
      payload: { user: tx-sender, pool-id: pool-id, amount: actual-repay }
    })

    (ok actual-repay)
  )
)

(define-public (get-collateral-factor (token principal))
  (ok DEFAULT_COLLATERAL_FACTOR)
)

(define-public (get-borrow-rate (token principal))
  (let (
    (pool-data (get-pool-by-token token))
  )
    (match pool-data
      data (ok (get borrow-rate data))
      (ok BASE_BORROW_RATE)
    )
  )
)

(define-public (get-supply-rate (token principal))
  (let (
    (pool-data (get-pool-by-token token))
  )
    (match pool-data
      data (ok (get supply-rate data))
      (ok BASE_SUPPLY_RATE)
    )
  )
)

(define-public (get-health-factor (user principal))
  (let (
    (position (map-get? borrow-positions { user: user, pool-id: SBTC_POOL_ID }))
  )
    (match position
      data (ok (calculate-health (get collateral data) (get borrowed data)))
      (ok HEALTH_SCALE)
    )
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

(define-private (get-pool-id-by-token (token principal))
  (if (is-eq token SBTC_TOKEN) SBTC_POOL_ID u2)
)

(define-private (get-pool-by-token (token principal))
  (map-get? pool-state (get-pool-id-by-token token))
)

(define-private (update-pool-state (pool-id uint) (new-supplied uint) (new-borrowed uint))
  (let (
    (existing (map-get? pool-state pool-id))
    (utilization (if (> new-supplied u0)
      (/ (* new-borrowed BPS_SCALE) new-supplied)
      u0
    ))
    (new-rates (calculate-rates utilization))
  )
    (match existing
      data (map-set pool-state pool-id
        (merge data {
          total-supplied: new-supplied,
          total-borrowed: new-borrowed,
          supply-rate: (get supply-rate new-rates),
          borrow-rate: (get borrow-rate new-rates),
          last-update-block: stacks-block-height
        })
      )
      (map-set pool-state pool-id {
        token: SBTC_TOKEN,
        total-supplied: new-supplied,
        total-borrowed: new-borrowed,
        supply-rate: (get supply-rate new-rates),
        borrow-rate: (get borrow-rate new-rates),
        collateral-factor: DEFAULT_COLLATERAL_FACTOR,
        paused: false,
        last-update-block: stacks-block-height
      })
    )
    true
  )
)

(define-private (calculate-rates (utilization uint))
  ;; Variable rate based on utilization
  ;; Below optimal: gradual increase
  ;; Above optimal: steep increase
  (if (<= utilization OPTIMAL_UTILIZATION)
    {
      supply-rate: (+ BASE_SUPPLY_RATE (/ (* utilization u200) BPS_SCALE)),
      borrow-rate: (+ BASE_BORROW_RATE (/ (* utilization u300) BPS_SCALE))
    }
    {
      supply-rate: (+ BASE_SUPPLY_RATE u500 (/ (* (- utilization OPTIMAL_UTILIZATION) u1000) BPS_SCALE)),
      borrow-rate: (+ BASE_BORROW_RATE u800 (/ (* (- utilization OPTIMAL_UTILIZATION) u2000) BPS_SCALE))
    }
  )
)

(define-private (calculate-health (collateral uint) (borrowed uint))
  (if (is-eq borrowed u0)
    HEALTH_SCALE
    (/ (* (* collateral DEFAULT_COLLATERAL_FACTOR) HEALTH_SCALE) (* borrowed BPS_SCALE))
  )
)

(define-private (calculate-lend-interest (principal uint) (rate uint) (blocks uint))
  ;; interest = principal * rate * blocks / (blocks_per_year * 10000)
  (/ (* (* principal rate) blocks) (* u52560 BPS_SCALE))
)

(define-private (calculate-pool-risk-score (supplied uint) (borrowed uint) (amount uint))
  ;; Risk based on utilization and position size
  (let (
    (utilization (if (> supplied u0) (/ (* borrowed BPS_SCALE) supplied) u0))
    (size-pct (if (> supplied u0) (/ (* amount BPS_SCALE) supplied) BPS_SCALE))
  )
    (+ (/ utilization u200) (/ size-pct u500))
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-lend-position (user principal) (pool-id uint))
  (map-get? lend-positions { user: user, pool-id: pool-id })
)

(define-read-only (get-borrow-position (user principal) (pool-id uint))
  (map-get? borrow-positions { user: user, pool-id: pool-id })
)

(define-read-only (get-pool-stats (pool-id uint))
  (map-get? pool-state pool-id)
)

(define-read-only (get-max-borrow (user principal) (pool-id uint))
  (let (
    (position (map-get? borrow-positions { user: user, pool-id: pool-id }))
  )
    (match position
      data (- (/ (* (get collateral data) DEFAULT_COLLATERAL_FACTOR) BPS_SCALE) (get borrowed data))
      u0
    )
  )
)

(define-read-only (is-liquidatable (user principal) (pool-id uint))
  (let (
    (position (map-get? borrow-positions { user: user, pool-id: pool-id }))
  )
    (match position
      data (< (calculate-health (get collateral data) (get borrowed data)) MIN_HEALTH_FACTOR)
      false
    )
  )
)
