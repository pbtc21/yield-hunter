;; sBTC Token Stub for Testing
;; Real contract: STV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RJ5XDY2.sbtc-token

(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token sbtc)

(define-constant ERR_NOT_AUTHORIZED (err u401))

(define-read-only (get-name)
  (ok "sBTC"))

(define-read-only (get-symbol)
  (ok "sBTC"))

(define-read-only (get-decimals)
  (ok u8))

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance sbtc who)))

(define-read-only (get-total-supply)
  (ok (ft-get-supply sbtc)))

(define-read-only (get-token-uri)
  (ok (some u"https://stacks.co/sbtc")))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_AUTHORIZED)
    (ft-transfer? sbtc amount sender recipient)
  )
)

;; Test helper: mint tokens for testing
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? sbtc amount recipient)
)
