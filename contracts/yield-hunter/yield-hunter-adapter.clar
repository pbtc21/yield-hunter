;; Yield Hunter Adapter - Bitflow XYK Integration
;; Swap adapter for yield operations via Bitflow pools
;;
;; Implements the swap adapter pattern from aibtc-agent-account
;; for seamless integration with the smart wallet system

;; ============================================
;; TRAITS
;; ============================================

(use-trait xyk-pool-trait .xyk-pool-trait.xyk-pool-trait)
(use-trait ft-trait .sip-010-trait.sip-010-trait)

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes
(define-constant ERR_NOT_AUTHORIZED (err u2001))
(define-constant ERR_INSUFFICIENT_BALANCE (err u2002))
(define-constant ERR_SLIPPAGE_EXCEEDED (err u2003))
(define-constant ERR_POOL_NOT_APPROVED (err u2004))
(define-constant ERR_INVALID_AMOUNT (err u2005))
(define-constant ERR_SWAP_FAILED (err u2006))
(define-constant ERR_LIQUIDITY_FAILED (err u2007))

;; Scale for calculations
(define-constant SCALE u100000000)
(define-constant BPS_SCALE u10000)

;; Default slippage tolerance (3%)
(define-constant DEFAULT_SLIPPAGE_BPS u300)

;; Contract references
(define-constant SBTC_TOKEN .sbtc-token)
(define-constant YIELD_HUNTER .yield-hunter)

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var contract-owner principal tx-sender)
(define-data-var total-swaps uint u0)
(define-data-var total-volume uint u0)

;; ============================================
;; DATA MAPS
;; ============================================

;; Pool configurations
(define-map pool-configs
  principal  ;; pool contract
  {
    token-x: principal,
    token-y: principal,
    fee-bps: uint,
    enabled: bool
  }
)

;; User swap history (for analytics)
(define-map user-stats
  principal
  {
    total-swaps: uint,
    total-volume-in: uint,
    total-volume-out: uint
  }
)

;; ============================================
;; AUTHORIZATION
;; ============================================

(define-private (is-authorized)
  (or
    (is-eq tx-sender (var-get contract-owner))
    (is-eq contract-caller YIELD_HUNTER)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - SWAPS
;; ============================================

;; Swap sBTC for token Y in pool
(define-public (swap-sbtc-for-y
    (pool <xyk-pool-trait>)
    (amount-in uint)
    (min-out uint)
  )
  (let (
    (pool-principal (contract-of pool))
    (sender tx-sender)
  )
    ;; Validate inputs
    (asserts! (> amount-in u0) ERR_INVALID_AMOUNT)

    ;; Get expected output
    (let ((expected-out (try! (contract-call? pool get-dy amount-in))))

      ;; Verify slippage
      (asserts! (>= expected-out min-out) ERR_SLIPPAGE_EXCEEDED)

      ;; Transfer sBTC to this contract
      (try! (contract-call? .sbtc-token transfer amount-in sender (as-contract tx-sender) none))

      ;; Execute swap
      (let ((actual-out (try! (as-contract (contract-call? pool swap-x-for-y amount-in (some min-out))))))

        ;; Update stats
        (update-user-stats sender amount-in actual-out)
        (var-set total-swaps (+ (var-get total-swaps) u1))
        (var-set total-volume (+ (var-get total-volume) amount-in))

        ;; Emit event
        (print {
          notification: "yield-hunter-adapter/SwapExecuted",
          payload: {
            sender: sender,
            pool: pool-principal,
            amount-in: amount-in,
            amount-out: actual-out,
            direction: "x-to-y",
            block: block-height
          }
        })

        (ok actual-out)
      )
    )
  )
)

;; Swap token Y for sBTC in pool
(define-public (swap-y-for-sbtc
    (pool <xyk-pool-trait>)
    (token-y <ft-trait>)
    (amount-in uint)
    (min-out uint)
  )
  (let (
    (pool-principal (contract-of pool))
    (sender tx-sender)
  )
    ;; Validate inputs
    (asserts! (> amount-in u0) ERR_INVALID_AMOUNT)

    ;; Get expected output
    (let ((expected-out (try! (contract-call? pool get-dx amount-in))))

      ;; Verify slippage
      (asserts! (>= expected-out min-out) ERR_SLIPPAGE_EXCEEDED)

      ;; Transfer token Y to this contract
      (try! (contract-call? token-y transfer amount-in sender (as-contract tx-sender) none))

      ;; Execute swap
      (let ((actual-out (try! (as-contract (contract-call? pool swap-y-for-x amount-in (some min-out))))))

        ;; Transfer sBTC back to sender
        (try! (as-contract (contract-call? .sbtc-token transfer actual-out tx-sender sender none)))

        ;; Update stats
        (update-user-stats sender amount-in actual-out)
        (var-set total-swaps (+ (var-get total-swaps) u1))
        (var-set total-volume (+ (var-get total-volume) actual-out))

        ;; Emit event
        (print {
          notification: "yield-hunter-adapter/SwapExecuted",
          payload: {
            sender: sender,
            pool: pool-principal,
            amount-in: amount-in,
            amount-out: actual-out,
            direction: "y-to-x",
            block: block-height
          }
        })

        (ok actual-out)
      )
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - LIQUIDITY
;; ============================================

;; Add liquidity with sBTC (single-sided)
(define-public (add-liquidity-sbtc
    (pool <xyk-pool-trait>)
    (sbtc-amount uint)
    (min-lp-tokens uint)
  )
  (let (
    (pool-principal (contract-of pool))
    (sender tx-sender)
  )
    ;; Validate inputs
    (asserts! (> sbtc-amount u0) ERR_INVALID_AMOUNT)

    ;; Transfer sBTC to this contract
    (try! (contract-call? .sbtc-token transfer sbtc-amount sender (as-contract tx-sender) none))

    ;; Add liquidity (single-sided: only sBTC)
    (let ((lp-received (try! (as-contract (contract-call? pool add-liquidity sbtc-amount u0 (some min-lp-tokens))))))

      ;; Verify minimum LP tokens received
      (asserts! (>= lp-received min-lp-tokens) ERR_SLIPPAGE_EXCEEDED)

      ;; Transfer LP tokens to sender
      (let ((lp-token (try! (contract-call? pool get-lp-token))))
        ;; In production, would transfer LP tokens here
        ;; (try! (as-contract (contract-call? lp-token transfer lp-received tx-sender sender none)))
        true
      )

      ;; Emit event
      (print {
        notification: "yield-hunter-adapter/LiquidityAdded",
        payload: {
          sender: sender,
          pool: pool-principal,
          sbtc-amount: sbtc-amount,
          lp-received: lp-received,
          block: block-height
        }
      })

      (ok lp-received)
    )
  )
)

;; Add liquidity with both tokens
(define-public (add-liquidity-balanced
    (pool <xyk-pool-trait>)
    (token-y <ft-trait>)
    (amount-x uint)
    (amount-y uint)
    (min-lp-tokens uint)
  )
  (let (
    (pool-principal (contract-of pool))
    (sender tx-sender)
  )
    ;; Validate inputs
    (asserts! (> amount-x u0) ERR_INVALID_AMOUNT)
    (asserts! (> amount-y u0) ERR_INVALID_AMOUNT)

    ;; Transfer tokens to this contract
    (try! (contract-call? .sbtc-token transfer amount-x sender (as-contract tx-sender) none))
    (try! (contract-call? token-y transfer amount-y sender (as-contract tx-sender) none))

    ;; Add liquidity
    (let ((lp-received (try! (as-contract (contract-call? pool add-liquidity amount-x amount-y (some min-lp-tokens))))))

      ;; Verify minimum LP tokens received
      (asserts! (>= lp-received min-lp-tokens) ERR_SLIPPAGE_EXCEEDED)

      ;; Emit event
      (print {
        notification: "yield-hunter-adapter/LiquidityAddedBalanced",
        payload: {
          sender: sender,
          pool: pool-principal,
          amount-x: amount-x,
          amount-y: amount-y,
          lp-received: lp-received,
          block: block-height
        }
      })

      (ok lp-received)
    )
  )
)

;; Remove liquidity
(define-public (remove-liquidity-sbtc
    (pool <xyk-pool-trait>)
    (lp-amount uint)
    (min-sbtc uint)
  )
  (let (
    (pool-principal (contract-of pool))
    (sender tx-sender)
  )
    ;; Validate inputs
    (asserts! (> lp-amount u0) ERR_INVALID_AMOUNT)

    ;; Remove liquidity
    (let ((withdrawn (try! (contract-call? pool remove-liquidity lp-amount (some min-sbtc) none))))
      (let (
        (received-x (get x withdrawn))
        (received-y (get y withdrawn))
      )
        ;; Verify minimum sBTC received
        (asserts! (>= received-x min-sbtc) ERR_SLIPPAGE_EXCEEDED)

        ;; Transfer tokens back to sender
        (try! (as-contract (contract-call? .sbtc-token transfer received-x tx-sender sender none)))
        ;; Token Y transfer would go here in production

        ;; Emit event
        (print {
          notification: "yield-hunter-adapter/LiquidityRemoved",
          payload: {
            sender: sender,
            pool: pool-principal,
            lp-amount: lp-amount,
            received-x: received-x,
            received-y: received-y,
            block: block-height
          }
        })

        (ok withdrawn)
      )
    )
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

;; Calculate output with slippage
(define-read-only (calculate-min-out (amount uint) (slippage-bps uint))
  (/ (* amount (- BPS_SCALE slippage-bps)) BPS_SCALE)
)

;; Update user statistics
(define-private (update-user-stats (user principal) (volume-in uint) (volume-out uint))
  (let (
    (current-stats (default-to
      { total-swaps: u0, total-volume-in: u0, total-volume-out: u0 }
      (map-get? user-stats user)
    ))
  )
    (map-set user-stats user {
      total-swaps: (+ (get total-swaps current-stats) u1),
      total-volume-in: (+ (get total-volume-in current-stats) volume-in),
      total-volume-out: (+ (get total-volume-out current-stats) volume-out)
    })
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Configure a pool
(define-public (configure-pool
    (pool-contract principal)
    (token-x principal)
    (token-y principal)
    (fee-bps uint)
    (enabled bool)
  )
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_NOT_AUTHORIZED)

    (map-set pool-configs pool-contract {
      token-x: token-x,
      token-y: token-y,
      fee-bps: fee-bps,
      enabled: enabled
    })

    (print {
      notification: "yield-hunter-adapter/PoolConfigured",
      payload: {
        pool: pool-contract,
        token-x: token-x,
        token-y: token-y,
        fee-bps: fee-bps,
        enabled: enabled
      }
    })

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

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-pool-config (pool-contract principal))
  (map-get? pool-configs pool-contract)
)

(define-read-only (get-user-stats (user principal))
  (default-to
    { total-swaps: u0, total-volume-in: u0, total-volume-out: u0 }
    (map-get? user-stats user)
  )
)

(define-read-only (get-global-stats)
  {
    total-swaps: (var-get total-swaps),
    total-volume: (var-get total-volume),
    contract-owner: (var-get contract-owner)
  }
)

;; Note: Must be public because it calls external contract via trait
;; The underlying get-dy/get-dx are read-only but Clarity requires public for trait calls
(define-public (get-expected-output
    (pool <xyk-pool-trait>)
    (amount-in uint)
    (direction (string-ascii 8))
  )
  (if (is-eq direction "x-to-y")
    (contract-call? pool get-dy amount-in)
    (contract-call? pool get-dx amount-in)
  )
)

(define-read-only (is-pool-enabled (pool-contract principal))
  (match (map-get? pool-configs pool-contract)
    config (get enabled config)
    false
  )
)
