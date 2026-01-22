;; Yield Hunter Adapter Trait
;; Standard interface for protocol integrations

(define-trait yield-adapter-trait
  (
    ;; Get adapter info
    (get-adapter-info () (response {
      name: (string-ascii 32),
      protocol: (string-ascii 32),
      version: (string-ascii 8),
      supported-tokens: (list 10 principal)
    } uint))

    ;; Calculate expected yield (APY in BPS, e.g., 500 = 5%)
    (get-expected-apy (principal uint) (response uint uint))

    ;; Calculate risk score (0-100, lower is safer)
    (calculate-risk-score (principal uint) (response uint uint))

    ;; Enter a yield position (returns position receipt/LP tokens)
    (enter-position (principal uint uint) (response uint uint))

    ;; Exit a yield position (returns withdrawn amount)
    (exit-position (principal uint uint) (response uint uint))

    ;; Claim pending rewards
    (claim-rewards (principal) (response uint uint))

    ;; Get current position value
    (get-position-value (principal) (response uint uint))
  )
)

;; Lending adapter trait (for protocols like ALEX, Zest)
(define-trait lending-adapter-trait
  (
    ;; Supply collateral
    (supply-collateral (principal uint) (response uint uint))

    ;; Withdraw collateral
    (withdraw-collateral (principal uint) (response uint uint))

    ;; Borrow against collateral
    (borrow (principal uint) (response uint uint))

    ;; Repay borrowed amount
    (repay (principal uint) (response uint uint))

    ;; Get collateral factor (BPS, e.g., 7500 = 75%)
    (get-collateral-factor (principal) (response uint uint))

    ;; Get borrow rate (APY in BPS)
    (get-borrow-rate (principal) (response uint uint))

    ;; Get supply rate (APY in BPS)
    (get-supply-rate (principal) (response uint uint))

    ;; Get account health factor (1e8 scale, >1 = healthy)
    (get-health-factor (principal) (response uint uint))
  )
)

;; AMM adapter trait (for protocols like Bitflow)
(define-trait amm-adapter-trait
  (
    ;; Add liquidity to pool
    (add-liquidity (principal principal uint uint uint) (response uint uint))

    ;; Remove liquidity from pool
    (remove-liquidity (principal principal uint uint uint) (response {x: uint, y: uint} uint))

    ;; Swap tokens
    (swap (principal principal uint uint) (response uint uint))

    ;; Get pool reserves
    (get-reserves (principal principal) (response {reserve-x: uint, reserve-y: uint} uint))

    ;; Get swap price (output for given input)
    (get-swap-quote (principal principal uint) (response uint uint))
  )
)
