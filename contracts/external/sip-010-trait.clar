;; SIP-010 Fungible Token Trait
;; Standard trait for fungible tokens on Stacks

(define-trait sip-010-trait
  (
    ;; Transfer from the caller to a new principal
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))

    ;; Get the name of the token
    (get-name () (response (string-ascii 32) uint))

    ;; Get the symbol of the token
    (get-symbol () (response (string-ascii 32) uint))

    ;; Get number of decimals
    (get-decimals () (response uint uint))

    ;; Get balance for principal
    (get-balance (principal) (response uint uint))

    ;; Get total supply
    (get-total-supply () (response uint uint))

    ;; Get token URI for metadata
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
