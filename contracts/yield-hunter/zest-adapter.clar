;; Zest Adapter
;; Integration with Zest Protocol for Bitcoin lending
;;
;; This adapter enables supplying sBTC to Zest to earn yield
;; MVP scope: supply and withdraw only (no borrowing)

(impl-trait .adapter-trait.yield-adapter-trait)

;; ============================================
;; ZEST TRAIT IMPORTS
;; ============================================
;; Import traits from Zest Protocol to make contract calls
(use-trait ft 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.ft-trait.ft-trait)
(use-trait redeemeable-token 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.redeemeable-trait-v1-2.redeemeable-trait)
(use-trait incentives-trait 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-trait-v2-1.incentives-trait)
(use-trait oracle-trait 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.oracle-trait.oracle-trait)

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR_NOT_AUTHORIZED (err u5001))
(define-constant ERR_POOL_NOT_FOUND (err u5002))
(define-constant ERR_INVALID_AMOUNT (err u5005))
(define-constant ERR_POSITION_NOT_FOUND (err u5006))
(define-constant ERR_ZEST_CALL_FAILED (err u5009))

;; Contract owner (deployer)
(define-constant CONTRACT_OWNER tx-sender)

;; Zest Protocol v2 mainnet contracts
(define-constant ZEST_BORROW_HELPER 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5)
(define-constant ZEST_POOL_RESERVE 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve)
(define-constant ZEST_INCENTIVES 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2)

;; Token contracts
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant ZSBTC_TOKEN 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0)

;; Scale factors
(define-constant SCALE u100000000)  ;; 1e8
(define-constant BPS_SCALE u10000)

;; ============================================
;; DATA MAPS
;; ============================================

;; Track user positions locally (for bookkeeping)
(define-map positions
  principal  ;; user
  {
    supplied: uint,
    entry-block: uint,
    last-update-block: uint
  }
)

;; Authorized callers (agents that can operate on behalf of users)
(define-map authorized-agents principal bool)

;; ============================================
;; AUTHORIZATION
;; ============================================

(define-public (authorize-agent (agent principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (ok (map-set authorized-agents agent true))
  )
)

(define-public (revoke-agent (agent principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (ok (map-delete authorized-agents agent))
  )
)

(define-read-only (is-authorized (agent principal))
  (or
    (is-eq agent CONTRACT_OWNER)
    (default-to false (map-get? authorized-agents agent))
  )
)

;; ============================================
;; YIELD ADAPTER IMPLEMENTATION
;; ============================================

(define-public (get-adapter-info)
  (ok {
    name: "Zest Protocol sBTC",
    protocol: "Zest",
    version: "2.0.0",
    supported-tokens: (list SBTC_TOKEN)
  })
)

(define-public (get-expected-apy (pool principal) (amount uint))
  ;; In production, this would query Zest's reserve state
  ;; For now return a reasonable estimate
  (ok u300)  ;; 3% base APY
)

(define-public (calculate-risk-score (pool principal) (amount uint))
  ;; Zest is a battle-tested lending protocol
  ;; Risk score: 25/100 (low-medium risk)
  (ok u25)
)

;; ============================================
;; SUPPLY sBTC TO ZEST
;; ============================================

(define-public (enter-position (pool principal) (amount uint) (min-receipt uint))
  (supply-sbtc amount)
)

;; Supply sBTC to Zest Protocol
;; This calls the real Zest borrow-helper supply function
(define-public (supply-sbtc (amount uint))
  (let (
    (user tx-sender)
    (existing (map-get? positions user))
  )
    ;; Validate amount
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)

    ;; Call Zest borrow-helper to supply sBTC
    ;; The borrow-helper handles the actual deposit to the pool
    (try! (contract-call?
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5
      supply
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0        ;; lp (zsBTC)
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve    ;; pool-reserve
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token       ;; asset (sBTC)
      amount                                                        ;; amount
      user                                                          ;; owner
      none                                                          ;; referral
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2   ;; incentives
    ))

    ;; Update local position tracking
    (match existing
      pos (map-set positions user
        (merge pos {
          supplied: (+ (get supplied pos) amount),
          last-update-block: block-height
        })
      )
      (map-set positions user {
        supplied: amount,
        entry-block: block-height,
        last-update-block: block-height
      })
    )

    ;; Emit event
    (print {
      notification: "zest-adapter/Supplied",
      payload: {
        user: user,
        amount: amount,
        block: block-height
      }
    })

    (ok amount)
  )
)

;; ============================================
;; WITHDRAW sBTC FROM ZEST
;; ============================================

(define-public (exit-position (pool principal) (amount uint) (min-receive uint))
  (withdraw-sbtc amount)
)

;; Withdraw sBTC from Zest Protocol
;; Note: withdraw requires more parameters including oracle and assets list
(define-public (withdraw-sbtc (amount uint))
  (let (
    (user tx-sender)
    (position (unwrap! (map-get? positions user) ERR_POSITION_NOT_FOUND))
  )
    ;; Validate amount
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (<= amount (get supplied position)) ERR_INVALID_AMOUNT)

    ;; Call Zest borrow-helper to withdraw sBTC
    ;; The withdraw function has a complex signature with oracles and asset lists
    (try! (contract-call?
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-5
      withdraw
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0        ;; lp (zsBTC)
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve    ;; pool-reserve
      'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token       ;; asset (sBTC)
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pyth-oracle-v3    ;; oracle
      amount                                                        ;; amount
      user                                                          ;; owner
      (list)                                                        ;; assets (empty for simple withdraw)
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2   ;; incentives
      none                                                          ;; price-feed-bytes
    ))

    ;; Update local position tracking
    (if (is-eq amount (get supplied position))
      (map-delete positions user)
      (map-set positions user
        (merge position {
          supplied: (- (get supplied position) amount),
          last-update-block: block-height
        })
      )
    )

    ;; Emit event
    (print {
      notification: "zest-adapter/Withdrawn",
      payload: {
        user: user,
        amount: amount,
        block: block-height
      }
    })

    (ok amount)
  )
)

;; ============================================
;; CLAIM REWARDS
;; ============================================

(define-public (claim-rewards (pool principal))
  ;; Zest incentives are claimed automatically during supply/withdraw
  ;; This is a no-op but satisfies the adapter interface
  (ok u0)
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-public (get-position-value (pool principal))
  (let (
    (user tx-sender)
    (position (map-get? positions user))
  )
    (match position
      pos (ok (get supplied pos))
      (ok u0)
    )
  )
)

(define-read-only (get-position (user principal))
  (map-get? positions user)
)

(define-read-only (get-zsbtc-balance (user principal))
  ;; Query actual zsBTC balance from Zest
  (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0 get-balance user)
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

(define-public (emergency-withdraw-all)
  (let (
    (user tx-sender)
    (position (unwrap! (map-get? positions user) ERR_POSITION_NOT_FOUND))
    (amount (get supplied position))
  )
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (withdraw-sbtc amount)
  )
)
