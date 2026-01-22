;; Arkadiko Adapter
;; Integration with Arkadiko Protocol for USDA stablecoin and vaults
;;
;; Arkadiko enables:
;; - USDA (Stacks-native stablecoin) minting via CDPs
;; - Staking USDA for yield
;; - Liquidation protection vaults

(impl-trait .adapter-trait.yield-adapter-trait)
(impl-trait .adapter-trait.lending-adapter-trait)

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR_NOT_AUTHORIZED (err u6001))
(define-constant ERR_VAULT_NOT_FOUND (err u6002))
(define-constant ERR_INSUFFICIENT_COLLATERAL (err u6003))
(define-constant ERR_BELOW_MIN_RATIO (err u6004))
(define-constant ERR_INVALID_AMOUNT (err u6005))
(define-constant ERR_POSITION_NOT_FOUND (err u6006))
(define-constant ERR_VAULT_LIQUIDATABLE (err u6007))
(define-constant ERR_STAKE_NOT_FOUND (err u6008))

;; Arkadiko contract references (mainnet)
(define-constant ARKADIKO_VAULT 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-vaults-v1-1)
(define-constant ARKADIKO_STAKING 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-stake-pool-v1-1)
(define-constant USDA_TOKEN 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token)
(define-constant DIKO_TOKEN 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token)
(define-constant SBTC_TOKEN 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)

;; Scale factors
(define-constant SCALE u100000000)  ;; 1e8
(define-constant BPS_SCALE u10000)
(define-constant RATIO_SCALE u100)  ;; For collateral ratio (150 = 150%)

;; CDP parameters
(define-constant MIN_COLLATERAL_RATIO u150)       ;; 150% minimum
(define-constant LIQUIDATION_RATIO u140)          ;; 140% liquidation threshold
(define-constant STABILITY_FEE_BPS u100)          ;; 1% annual stability fee
(define-constant USDA_STAKING_APY u800)           ;; 8% staking APY

;; ============================================
;; DATA MAPS
;; ============================================

;; CDP vaults (Collateralized Debt Positions)
(define-map cdp-vaults
  { user: principal, collateral-type: principal }
  {
    collateral: uint,
    debt: uint,           ;; USDA minted
    stability-fee: uint,  ;; Accrued fees
    entry-block: uint,
    last-update-block: uint
  }
)

;; USDA staking positions
(define-map usda-stakes
  principal
  {
    staked: uint,
    rewards-earned: uint,
    entry-block: uint,
    last-claim-block: uint
  }
)

;; Collateral type settings
(define-map collateral-types
  principal
  {
    min-ratio: uint,
    liquidation-ratio: uint,
    stability-fee: uint,
    enabled: bool
  }
)

;; ============================================
;; YIELD ADAPTER IMPLEMENTATION
;; ============================================

(define-public (get-adapter-info)
  (ok {
    name: "Arkadiko Finance",
    protocol: "Arkadiko",
    version: "1.1.0",
    supported-tokens: (list
      SBTC_TOKEN
      USDA_TOKEN
      DIKO_TOKEN
    )
  })
)

(define-public (get-expected-apy (token principal) (amount uint))
  ;; USDA staking offers ~8% APY
  ;; CDP yield comes from leveraged positions
  (if (is-eq token USDA_TOKEN)
    (ok USDA_STAKING_APY)
    (ok u500)  ;; 5% estimated for leveraged strategies
  )
)

(define-public (calculate-risk-score (token principal) (amount uint))
  ;; CDP risk depends on collateral ratio
  ;; Staking has lower risk
  (if (is-eq token USDA_TOKEN)
    (ok u20)  ;; Low risk for staking
    (ok u45)  ;; Medium risk for CDPs
  )
)

(define-public (enter-position (token principal) (amount uint) (min-receipt uint))
  (if (is-eq token USDA_TOKEN)
    ;; Stake USDA
    (stake-usda amount)
    ;; Open CDP with sBTC collateral
    (deposit-collateral token amount)
  )
)

(define-public (exit-position (token principal) (amount uint) (min-receive uint))
  (if (is-eq token USDA_TOKEN)
    (unstake-usda amount)
    (withdraw-collateral-amount token amount)
  )
)

(define-public (claim-rewards (token principal))
  (if (is-eq token USDA_TOKEN)
    (claim-staking-rewards)
    (ok u0)  ;; CDPs don't have claimable rewards
  )
)

(define-public (get-position-value (token principal))
  (if (is-eq token USDA_TOKEN)
    (let ((stake (map-get? usda-stakes tx-sender)))
      (match stake
        data (ok (+ (get staked data) (get rewards-earned data)))
        (ok u0)
      )
    )
    (let ((cdp (map-get? cdp-vaults { user: tx-sender, collateral-type: token })))
      (match cdp
        data (ok (get collateral data))
        (ok u0)
      )
    )
  )
)

;; ============================================
;; LENDING ADAPTER IMPLEMENTATION (CDP Operations)
;; ============================================

(define-public (supply-collateral (token principal) (amount uint))
  (deposit-collateral token amount)
)

(define-public (withdraw-collateral (token principal) (amount uint))
  (withdraw-collateral-amount token amount)
)

(define-public (borrow (token principal) (amount uint))
  ;; For Arkadiko, "borrowing" = minting USDA against collateral
  (mint-usda token amount)
)

(define-public (repay (token principal) (amount uint))
  ;; For Arkadiko, "repaying" = burning USDA to reduce debt
  (burn-usda token amount)
)

(define-public (get-collateral-factor (token principal))
  (let ((settings (map-get? collateral-types token)))
    (match settings
      data (ok (/ (* BPS_SCALE RATIO_SCALE) (get min-ratio data)))  ;; Convert ratio to factor
      (ok u6666)  ;; ~66% default (150% ratio)
    )
  )
)

(define-public (get-borrow-rate (token principal))
  ;; Stability fee for CDPs
  (let ((settings (map-get? collateral-types token)))
    (match settings
      data (ok (get stability-fee data))
      (ok STABILITY_FEE_BPS)
    )
  )
)

(define-public (get-supply-rate (token principal))
  ;; CDPs don't earn supply rate on collateral
  (ok u0)
)

(define-public (get-health-factor (user principal))
  (let ((cdp (map-get? cdp-vaults { user: user, collateral-type: SBTC_TOKEN })))
    (match cdp
      data (let ((ratio (calculate-collateral-ratio (get collateral data) (get debt data))))
        ;; Convert ratio to health factor (1e8 scale)
        ;; 150% ratio = 1.0 health, 200% ratio = 1.33 health
        (ok (/ (* ratio SCALE) MIN_COLLATERAL_RATIO))
      )
      (ok SCALE)
    )
  )
)

;; ============================================
;; CDP-SPECIFIC FUNCTIONS
;; ============================================

(define-private (deposit-collateral (token principal) (amount uint))
  (let ((existing (map-get? cdp-vaults { user: tx-sender, collateral-type: token })))
    ;; In production: transfer collateral to Arkadiko vault
    ;; Update or create CDP
    (match existing
      data (begin
        ;; Accrue stability fee
        (let ((accrued-fee (calculate-stability-fee (get debt data) (- block-height (get last-update-block data)))))
          (map-set cdp-vaults { user: tx-sender, collateral-type: token }
            (merge data {
              collateral: (+ (get collateral data) amount),
              stability-fee: (+ (get stability-fee data) accrued-fee),
              last-update-block: block-height
            })
          )
        )
        (ok amount)
      )
      (begin
        (map-set cdp-vaults { user: tx-sender, collateral-type: token } {
          collateral: amount,
          debt: u0,
          stability-fee: u0,
          entry-block: block-height,
          last-update-block: block-height
        })
        (ok amount)
      )
    )
  )
)

(define-private (withdraw-collateral-amount (token principal) (amount uint))
  (let ((cdp (unwrap! (map-get? cdp-vaults { user: tx-sender, collateral-type: token }) ERR_VAULT_NOT_FOUND)))
    (asserts! (>= (get collateral cdp) amount) ERR_INVALID_AMOUNT)

    ;; Check ratio after withdrawal
    (let (
      (new-collateral (- (get collateral cdp) amount))
      (new-ratio (calculate-collateral-ratio new-collateral (get debt cdp)))
    )
      (asserts! (or (is-eq (get debt cdp) u0) (>= new-ratio MIN_COLLATERAL_RATIO)) ERR_BELOW_MIN_RATIO)

      ;; In production: withdraw from Arkadiko
      ;; Update CDP
      (if (and (is-eq new-collateral u0) (is-eq (get debt cdp) u0))
        (map-delete cdp-vaults { user: tx-sender, collateral-type: token })
        (map-set cdp-vaults { user: tx-sender, collateral-type: token }
          (merge cdp {
            collateral: new-collateral,
            last-update-block: block-height
          })
        )
      )

      (print {
        notification: "arkadiko-adapter/CollateralWithdrawn",
        payload: { user: tx-sender, token: token, amount: amount }
      })

      (ok amount)
    )
  )
)

(define-private (mint-usda (collateral-type principal) (amount uint))
  (let ((cdp (unwrap! (map-get? cdp-vaults { user: tx-sender, collateral-type: collateral-type }) ERR_VAULT_NOT_FOUND)))
    ;; Check ratio after minting
    (let (
      (new-debt (+ (get debt cdp) amount))
      (new-ratio (calculate-collateral-ratio (get collateral cdp) new-debt))
    )
      (asserts! (>= new-ratio MIN_COLLATERAL_RATIO) ERR_BELOW_MIN_RATIO)

      ;; In production: mint USDA
      ;; Update CDP
      (map-set cdp-vaults { user: tx-sender, collateral-type: collateral-type }
        (merge cdp {
          debt: new-debt,
          last-update-block: block-height
        })
      )

      (print {
        notification: "arkadiko-adapter/USDAMinted",
        payload: { user: tx-sender, amount: amount, new-debt: new-debt }
      })

      (ok amount)
    )
  )
)

(define-private (burn-usda (collateral-type principal) (amount uint))
  (let ((cdp (unwrap! (map-get? cdp-vaults { user: tx-sender, collateral-type: collateral-type }) ERR_VAULT_NOT_FOUND)))
    (let (
      (actual-burn (if (> amount (get debt cdp)) (get debt cdp) amount))
      (accrued-fee (calculate-stability-fee (get debt cdp) (- block-height (get last-update-block cdp))))
    )
      ;; In production: burn USDA
      ;; Update CDP
      (map-set cdp-vaults { user: tx-sender, collateral-type: collateral-type }
        (merge cdp {
          debt: (- (get debt cdp) actual-burn),
          stability-fee: (+ (get stability-fee cdp) accrued-fee),
          last-update-block: block-height
        })
      )

      (print {
        notification: "arkadiko-adapter/USDABurned",
        payload: { user: tx-sender, amount: actual-burn }
      })

      (ok actual-burn)
    )
  )
)

;; ============================================
;; USDA STAKING FUNCTIONS
;; ============================================

(define-private (stake-usda (amount uint))
  (let ((existing (map-get? usda-stakes tx-sender)))
    ;; In production: transfer USDA to staking pool
    (match existing
      data (let (
        (pending-rewards (calculate-staking-rewards (get staked data) (- block-height (get last-claim-block data))))
      )
        (map-set usda-stakes tx-sender
          (merge data {
            staked: (+ (get staked data) amount),
            rewards-earned: (+ (get rewards-earned data) pending-rewards),
            last-claim-block: block-height
          })
        )
        (ok amount)
      )
      (begin
        (map-set usda-stakes tx-sender {
          staked: amount,
          rewards-earned: u0,
          entry-block: block-height,
          last-claim-block: block-height
        })
        (ok amount)
      )
    )
  )
)

(define-private (unstake-usda (amount uint))
  (let ((stake (unwrap! (map-get? usda-stakes tx-sender) ERR_STAKE_NOT_FOUND)))
    (asserts! (>= (get staked stake) amount) ERR_INVALID_AMOUNT)

    (let (
      (pending-rewards (calculate-staking-rewards (get staked stake) (- block-height (get last-claim-block stake))))
      (new-staked (- (get staked stake) amount))
    )
      ;; In production: withdraw from staking pool
      (if (is-eq new-staked u0)
        (map-delete usda-stakes tx-sender)
        (map-set usda-stakes tx-sender
          (merge stake {
            staked: new-staked,
            rewards-earned: (+ (get rewards-earned stake) pending-rewards),
            last-claim-block: block-height
          })
        )
      )

      (print {
        notification: "arkadiko-adapter/USDAUnstaked",
        payload: { user: tx-sender, amount: amount, rewards: pending-rewards }
      })

      (ok (+ amount pending-rewards))
    )
  )
)

(define-private (claim-staking-rewards)
  (let ((stake (unwrap! (map-get? usda-stakes tx-sender) ERR_STAKE_NOT_FOUND)))
    (let (
      (pending-rewards (calculate-staking-rewards (get staked stake) (- block-height (get last-claim-block stake))))
      (total-rewards (+ (get rewards-earned stake) pending-rewards))
    )
      ;; In production: mint DIKO rewards
      (map-set usda-stakes tx-sender
        (merge stake {
          rewards-earned: u0,
          last-claim-block: block-height
        })
      )

      (print {
        notification: "arkadiko-adapter/StakingRewardsClaimed",
        payload: { user: tx-sender, rewards: total-rewards }
      })

      (ok total-rewards)
    )
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

(define-private (calculate-collateral-ratio (collateral uint) (debt uint))
  ;; Ratio = (collateral * 100) / debt
  ;; Returns percentage (150 = 150%)
  (if (is-eq debt u0)
    u999  ;; Infinite ratio if no debt
    (/ (* collateral RATIO_SCALE) debt)
  )
)

(define-private (calculate-stability-fee (debt uint) (blocks uint))
  ;; Fee = debt * rate * blocks / (blocks_per_year * 10000)
  (/ (* (* debt STABILITY_FEE_BPS) blocks) (* u52560 BPS_SCALE))
)

(define-private (calculate-staking-rewards (staked uint) (blocks uint))
  ;; Rewards = staked * APY * blocks / (blocks_per_year * 10000)
  (/ (* (* staked USDA_STAKING_APY) blocks) (* u52560 BPS_SCALE))
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-cdp (user principal) (collateral-type principal))
  (map-get? cdp-vaults { user: user, collateral-type: collateral-type })
)

(define-read-only (get-stake (user principal))
  (map-get? usda-stakes user)
)

(define-read-only (get-cdp-ratio (user principal) (collateral-type principal))
  (let ((cdp (map-get? cdp-vaults { user: user, collateral-type: collateral-type })))
    (match cdp
      data (calculate-collateral-ratio (get collateral data) (get debt data))
      u0
    )
  )
)

(define-read-only (get-max-mintable (user principal) (collateral-type principal))
  (let ((cdp (map-get? cdp-vaults { user: user, collateral-type: collateral-type })))
    (match cdp
      data (let (
        (max-debt (/ (* (get collateral data) RATIO_SCALE) MIN_COLLATERAL_RATIO))
      )
        (if (> max-debt (get debt data))
          (- max-debt (get debt data))
          u0
        )
      )
      u0
    )
  )
)

(define-read-only (is-liquidatable (user principal) (collateral-type principal))
  (let ((cdp (map-get? cdp-vaults { user: user, collateral-type: collateral-type })))
    (match cdp
      data (< (calculate-collateral-ratio (get collateral data) (get debt data)) LIQUIDATION_RATIO)
      false
    )
  )
)

(define-read-only (get-pending-staking-rewards (user principal))
  (let ((stake (map-get? usda-stakes user)))
    (match stake
      data (+ (get rewards-earned data)
        (calculate-staking-rewards (get staked data) (- block-height (get last-claim-block data)))
      )
      u0
    )
  )
)

(define-read-only (get-collateral-settings (token principal))
  (default-to {
    min-ratio: MIN_COLLATERAL_RATIO,
    liquidation-ratio: LIQUIDATION_RATIO,
    stability-fee: STABILITY_FEE_BPS,
    enabled: true
  } (map-get? collateral-types token))
)
