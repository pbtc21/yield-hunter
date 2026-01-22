;; XYK Pool Trait (Bitflow)
;; Reference: xyk-pool-trait-v-1-2

(define-trait xyk-pool-trait
  (
    ;; Get pool reserves
    (get-x-balance () (response uint uint))
    (get-y-balance () (response uint uint))

    ;; Get swap output amounts
    (get-dy (uint) (response uint uint))
    (get-dx (uint) (response uint uint))

    ;; Execute swaps
    (swap-x-for-y (uint (optional uint)) (response uint uint))
    (swap-y-for-x (uint (optional uint)) (response uint uint))

    ;; Liquidity management
    (add-liquidity (uint uint (optional uint)) (response uint uint))
    (remove-liquidity (uint (optional uint) (optional uint)) (response (tuple (x uint) (y uint)) uint))

    ;; Pool info
    (get-lp-token () (response principal uint))
    (get-fee () (response uint uint))
  )
)
