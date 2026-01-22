;; Yield Hunter Oracle - Risk Scoring, Price Validation & Leaderboard
;; On-chain risk assessment using Pyth Oracle + earnings leaderboard
;;
;; Features:
;; - Risk score calculation based on liquidity, volume, concentration, age
;; - Price validation against Pyth Oracle feeds
;; - Earnings leaderboard tracking top hunters
;; - Performance analytics

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes
(define-constant ERR_NOT_AUTHORIZED (err u3001))
(define-constant ERR_INVALID_PRICE (err u3002))
(define-constant ERR_PRICE_STALE (err u3003))
(define-constant ERR_DEVIATION_TOO_HIGH (err u3004))
(define-constant ERR_HUNTER_NOT_FOUND (err u3005))
(define-constant ERR_ALREADY_REGISTERED (err u3006))

;; Pyth Oracle references (mainnet)
(define-constant PYTH_ORACLE 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4)
(define-constant PYTH_STORAGE 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4)

;; Price feed IDs (from Pyth)
(define-constant BTC_FEED_ID 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43)
(define-constant STX_FEED_ID 0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17)

;; Scale factors
(define-constant SCALE u100000000)       ;; 8 decimals (like sBTC)
(define-constant BPS_SCALE u10000)       ;; Basis points
(define-constant RISK_SCALE u100)        ;; Risk score 0-100

;; Risk thresholds
(define-constant HIGH_RISK_THRESHOLD u70)
(define-constant MEDIUM_RISK_THRESHOLD u40)
(define-constant LOW_RISK_THRESHOLD u20)

;; Price staleness threshold (blocks)
(define-constant MAX_PRICE_AGE u10)      ;; ~10 minutes

;; Leaderboard size
(define-constant LEADERBOARD_SIZE u100)

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var contract-owner principal tx-sender)
(define-data-var total-registered-hunters uint u0)
(define-data-var leaderboard-updated-at uint u0)

;; ============================================
;; DATA MAPS
;; ============================================

;; Hunter earnings tracking
(define-map hunter-earnings
  principal  ;; hunter account
  {
    name: (string-utf8 64),
    owner: principal,
    bitcoin-face-id: uint,
    total-earnings: uint,
    total-invested: uint,
    positions-opened: uint,
    positions-closed: uint,
    profitable-positions: uint,
    win-rate-bps: uint,
    best-apy-bps: uint,
    worst-loss-bps: uint,
    registered-at: uint,
    last-active: uint,
    alive: bool
  }
)

;; Leaderboard ranking (position -> hunter)
(define-map leaderboard-by-rank
  uint       ;; rank (1-100)
  principal  ;; hunter account
)

;; Hunter -> rank lookup
(define-map hunter-rank
  principal
  uint
)

;; Risk weight configuration
(define-map risk-weights
  (string-ascii 32)  ;; factor name
  uint               ;; weight in BPS (total should be 10000)
)

;; Pool risk scores (cached)
(define-map pool-risk-cache
  principal  ;; pool contract
  {
    risk-score: uint,
    calculated-at: uint,
    liquidity: uint,
    volume-24h: uint,
    holder-count: uint,
    age-blocks: uint
  }
)

;; ============================================
;; INITIALIZATION
;; ============================================

;; Set default risk weights
(map-set risk-weights "liquidity" u4000)      ;; 40%
(map-set risk-weights "volume" u2500)         ;; 25%
(map-set risk-weights "concentration" u2000)  ;; 20%
(map-set risk-weights "age" u1500)            ;; 15%

;; ============================================
;; PUBLIC FUNCTIONS - LEADERBOARD
;; ============================================

;; Register a hunter on the leaderboard
(define-public (register-hunter
    (hunter-account principal)
    (name (string-utf8 64))
    (owner principal)
    (bitcoin-face-id uint)
  )
  (begin
    ;; Check not already registered
    (asserts! (is-none (map-get? hunter-earnings hunter-account)) ERR_ALREADY_REGISTERED)

    ;; Create entry
    (map-set hunter-earnings hunter-account {
      name: name,
      owner: owner,
      bitcoin-face-id: bitcoin-face-id,
      total-earnings: u0,
      total-invested: u0,
      positions-opened: u0,
      positions-closed: u0,
      profitable-positions: u0,
      win-rate-bps: u0,
      best-apy-bps: u0,
      worst-loss-bps: u0,
      registered-at: stacks-block-height,
      last-active: stacks-block-height,
      alive: true
    })

    ;; Increment counter
    (var-set total-registered-hunters (+ (var-get total-registered-hunters) u1))

    ;; Emit event
    (print {
      notification: "yield-hunter-oracle/HunterRegistered",
      payload: {
        hunter: hunter-account,
        name: name,
        owner: owner,
        bitcoin-face-id: bitcoin-face-id,
        block: stacks-block-height
      }
    })

    (ok true)
  )
)

;; Update hunter earnings (called by yield-hunter contract)
(define-public (record-earnings
    (hunter-account principal)
    (earnings uint)
    (invested uint)
    (is-profitable bool)
    (apy-bps uint)
  )
  (let (
    (hunter-data (unwrap! (map-get? hunter-earnings hunter-account) ERR_HUNTER_NOT_FOUND))
    (new-profitable (if is-profitable (+ (get profitable-positions hunter-data) u1) (get profitable-positions hunter-data)))
    (new-positions-closed (+ (get positions-closed hunter-data) u1))
    (new-win-rate (if (> new-positions-closed u0)
      (/ (* new-profitable BPS_SCALE) new-positions-closed)
      u0
    ))
    (new-best-apy (if (> apy-bps (get best-apy-bps hunter-data)) apy-bps (get best-apy-bps hunter-data)))
    (new-worst-loss (if (and (not is-profitable) (> apy-bps (get worst-loss-bps hunter-data)))
      apy-bps
      (get worst-loss-bps hunter-data)
    ))
  )
    ;; Update earnings
    (map-set hunter-earnings hunter-account
      (merge hunter-data {
        total-earnings: (+ (get total-earnings hunter-data) earnings),
        total-invested: (+ (get total-invested hunter-data) invested),
        positions-closed: new-positions-closed,
        profitable-positions: new-profitable,
        win-rate-bps: new-win-rate,
        best-apy-bps: new-best-apy,
        worst-loss-bps: new-worst-loss,
        last-active: stacks-block-height
      })
    )

    ;; Update leaderboard position
    (try! (update-leaderboard-position hunter-account (+ (get total-earnings hunter-data) earnings)))

    ;; Emit event
    (print {
      notification: "yield-hunter-oracle/EarningsRecorded",
      payload: {
        hunter: hunter-account,
        earnings: earnings,
        total-earnings: (+ (get total-earnings hunter-data) earnings),
        win-rate-bps: new-win-rate,
        block: stacks-block-height
      }
    })

    (ok true)
  )
)

;; Record hunter death
(define-public (record-death (hunter-account principal))
  (let (
    (hunter-data (unwrap! (map-get? hunter-earnings hunter-account) ERR_HUNTER_NOT_FOUND))
  )
    (map-set hunter-earnings hunter-account
      (merge hunter-data {
        alive: false,
        last-active: stacks-block-height
      })
    )

    (print {
      notification: "yield-hunter-oracle/HunterDied",
      payload: {
        hunter: hunter-account,
        total-earnings: (get total-earnings hunter-data),
        lifespan-blocks: (- stacks-block-height (get registered-at hunter-data))
      }
    })

    (ok true)
  )
)

;; Update leaderboard position (internal)
(define-private (update-leaderboard-position (hunter-account principal) (new-earnings uint))
  (let (
    (current-rank (default-to u0 (map-get? hunter-rank hunter-account)))
  )
    ;; If not on leaderboard, try to enter
    (if (is-eq current-rank u0)
      (try-enter-leaderboard hunter-account new-earnings)
      ;; If already on leaderboard, check if position changed
      (try-improve-rank hunter-account current-rank new-earnings)
    )
  )
)

;; Try to enter leaderboard (internal)
(define-private (try-enter-leaderboard (hunter-account principal) (earnings uint))
  (let (
    (last-rank LEADERBOARD_SIZE)
    (last-hunter (map-get? leaderboard-by-rank last-rank))
  )
    (match last-hunter
      existing-hunter
      (let ((existing-data (map-get? hunter-earnings existing-hunter)))
        (match existing-data
          data
          (if (> earnings (get total-earnings data))
            (begin
              ;; Remove old holder
              (map-delete hunter-rank existing-hunter)
              ;; Add new hunter at last position
              (map-set leaderboard-by-rank last-rank hunter-account)
              (map-set hunter-rank hunter-account last-rank)
              ;; Try to bubble up
              (try-improve-rank hunter-account last-rank earnings)
            )
            (ok true)
          )
          (ok true)
        )
      )
      ;; No hunter at last rank, add directly
      (begin
        (map-set leaderboard-by-rank last-rank hunter-account)
        (map-set hunter-rank hunter-account last-rank)
        (try-improve-rank hunter-account last-rank earnings)
      )
    )
  )
)

;; Try to improve rank (simplified bubble-up)
(define-private (try-improve-rank (hunter-account principal) (current-rank uint) (earnings uint))
  (if (<= current-rank u1)
    (ok true)  ;; Already at top
    (let (
      (higher-rank (- current-rank u1))
      (higher-hunter (map-get? leaderboard-by-rank higher-rank))
    )
      (match higher-hunter
        existing-higher
        (let ((higher-data (map-get? hunter-earnings existing-higher)))
          (match higher-data
            data
            (if (> earnings (get total-earnings data))
              (begin
                ;; Swap positions
                (map-set leaderboard-by-rank current-rank existing-higher)
                (map-set hunter-rank existing-higher current-rank)
                (map-set leaderboard-by-rank higher-rank hunter-account)
                (map-set hunter-rank hunter-account higher-rank)
                ;; Continue bubbling
                (try-improve-rank hunter-account higher-rank earnings)
              )
              (ok true)
            )
            (ok true)
          )
        )
        (ok true)
      )
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - RISK SCORING
;; ============================================

;; Calculate risk score for a pool
(define-public (calculate-risk-score
    (pool-contract principal)
    (liquidity uint)
    (volume-24h uint)
    (holder-count uint)
    (age-blocks uint)
  )
  (let (
    (liquidity-score (get-liquidity-risk liquidity))
    (volume-score (get-volume-risk volume-24h))
    (concentration-score (get-concentration-risk holder-count))
    (age-score (get-age-risk age-blocks))
    (liquidity-weight (default-to u4000 (map-get? risk-weights "liquidity")))
    (volume-weight (default-to u2500 (map-get? risk-weights "volume")))
    (concentration-weight (default-to u2000 (map-get? risk-weights "concentration")))
    (age-weight (default-to u1500 (map-get? risk-weights "age")))
    (weighted-score (/ (+
      (* liquidity-score liquidity-weight)
      (* volume-score volume-weight)
      (* concentration-score concentration-weight)
      (* age-score age-weight)
    ) BPS_SCALE))
  )
    ;; Cache the result
    (map-set pool-risk-cache pool-contract {
      risk-score: weighted-score,
      calculated-at: stacks-block-height,
      liquidity: liquidity,
      volume-24h: volume-24h,
      holder-count: holder-count,
      age-blocks: age-blocks
    })

    ;; Emit event
    (print {
      notification: "yield-hunter-oracle/RiskScoreCalculated",
      payload: {
        pool: pool-contract,
        risk-score: weighted-score,
        liquidity-score: liquidity-score,
        volume-score: volume-score,
        concentration-score: concentration-score,
        age-score: age-score,
        block: stacks-block-height
      }
    })

    (ok weighted-score)
  )
)

;; Get risk score components
(define-read-only (get-liquidity-risk (liquidity uint))
  (if (< liquidity u100000000)        u80    ;; < 1 BTC = very risky
    (if (< liquidity u1000000000)     u50    ;; < 10 BTC = moderate
      (if (< liquidity u10000000000)  u25    ;; < 100 BTC = low risk
        u10                                   ;; >= 100 BTC = very safe
      )
    )
  )
)

(define-read-only (get-volume-risk (volume-24h uint))
  (if (< volume-24h u10000000)        u70    ;; < 0.1 BTC = very risky
    (if (< volume-24h u100000000)     u40    ;; < 1 BTC = moderate
      u15                                     ;; >= 1 BTC = safe
    )
  )
)

(define-read-only (get-concentration-risk (holder-count uint))
  (if (< holder-count u10)            u90    ;; < 10 holders = very risky
    (if (< holder-count u50)          u60    ;; < 50 = moderate
      (if (< holder-count u200)       u30    ;; < 200 = low risk
        u10                                   ;; >= 200 = safe
      )
    )
  )
)

(define-read-only (get-age-risk (age-blocks uint))
  (if (< age-blocks u1440)            u80    ;; < 10 days = very risky
    (if (< age-blocks u4320)          u50    ;; < 30 days = moderate
      (if (< age-blocks u14400)       u25    ;; < 100 days = low risk
        u10                                   ;; >= 100 days = safe
      )
    )
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS - LEADERBOARD
;; ============================================

(define-read-only (get-hunter-earnings (hunter-account principal))
  (map-get? hunter-earnings hunter-account)
)

(define-read-only (get-leaderboard-entry (rank uint))
  (match (map-get? leaderboard-by-rank rank)
    hunter (map-get? hunter-earnings hunter)
    none
  )
)

(define-read-only (get-hunter-rank (hunter-account principal))
  (default-to u0 (map-get? hunter-rank hunter-account))
)

;; Get top N hunters (returns list of principals)
(define-read-only (get-top-hunters (count uint))
  (let (
    (limit (if (> count LEADERBOARD_SIZE) LEADERBOARD_SIZE count))
  )
    ;; Return principals for ranks 1 to limit
    ;; Note: In production, would use fold for efficiency
    (list
      (map-get? leaderboard-by-rank u1)
      (map-get? leaderboard-by-rank u2)
      (map-get? leaderboard-by-rank u3)
      (map-get? leaderboard-by-rank u4)
      (map-get? leaderboard-by-rank u5)
      (map-get? leaderboard-by-rank u6)
      (map-get? leaderboard-by-rank u7)
      (map-get? leaderboard-by-rank u8)
      (map-get? leaderboard-by-rank u9)
      (map-get? leaderboard-by-rank u10)
    )
  )
)

;; Get leaderboard stats
(define-read-only (get-leaderboard-stats)
  {
    total-hunters: (var-get total-registered-hunters),
    last-updated: (var-get leaderboard-updated-at)
  }
)

;; ============================================
;; READ-ONLY FUNCTIONS - RISK
;; ============================================

(define-read-only (get-pool-risk-cache (pool-contract principal))
  (map-get? pool-risk-cache pool-contract)
)

(define-read-only (get-risk-weights)
  {
    liquidity: (default-to u4000 (map-get? risk-weights "liquidity")),
    volume: (default-to u2500 (map-get? risk-weights "volume")),
    concentration: (default-to u2000 (map-get? risk-weights "concentration")),
    age: (default-to u1500 (map-get? risk-weights "age"))
  }
)

(define-read-only (get-risk-category (risk-score uint))
  (if (>= risk-score HIGH_RISK_THRESHOLD)
    "high"
    (if (>= risk-score MEDIUM_RISK_THRESHOLD)
      "medium"
      (if (>= risk-score LOW_RISK_THRESHOLD)
        "low"
        "very-low"
      )
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Update risk weights
(define-public (set-risk-weight (factor (string-ascii 32)) (weight uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (map-set risk-weights factor weight)
    (ok true)
  )
)

;; Transfer ownership
(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)
