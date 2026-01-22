;; Agent Lifecycle - Tamagotchi Mechanics for Yield Hunters
;;
;; Wisdom: Energy is scarce. Survival requires intelligence.
;; Bitcoin as energy money - agents consume sBTC to compute, earn sBTC to survive.
;;
;; Integrates with:
;; - yield-hunter.clar (core logic)
;; - ERC-8004 identity registry
;; - Bitcoin Faces for deterministic identity generation

;; ============================================
;; CONSTANTS - First Principles
;; ============================================

;; Error codes
(define-constant ERR_NOT_AUTHORIZED (err u2001))
(define-constant ERR_AGENT_NOT_FOUND (err u2002))
(define-constant ERR_AGENT_DEAD (err u2003))
(define-constant ERR_ALREADY_FED (err u2004))
(define-constant ERR_INSUFFICIENT_FEED (err u2005))
(define-constant ERR_REBIRTH_TOO_SOON (err u2006))
(define-constant ERR_MAX_LEVEL_REACHED (err u2007))
(define-constant ERR_NAME_TAKEN (err u2008))
(define-constant ERR_INVALID_IDENTITY (err u2009))

;; Energy economics - Bitcoin as compute fuel
;; Every action has an energy cost (in sats)
(define-constant FEED_COST_SATS u10000)            ;; 10,000 sats to feed
(define-constant MIN_FEED_INTERVAL u144)           ;; ~1 day between feeds
(define-constant HUNGER_DECAY_RATE u1)             ;; Hunger increases 1 per block
(define-constant HEALTH_DECAY_BASE u1)             ;; Base health decay
(define-constant MAX_HUNGER u100)                  ;; Max hunger = death
(define-constant MAX_HEALTH u100)

;; XP and leveling - Darwinian selection rewards winners
(define-constant XP_PER_PROFITABLE_HUNT u100)
(define-constant XP_PER_COMPOUND u25)
(define-constant XP_PER_SURVIVAL_DAY u10)
(define-constant XP_LOSS_PER_LOSS u50)

;; Level thresholds - Evolution through performance
(define-constant LEVEL_HATCHLING u0)
(define-constant LEVEL_JUNIOR u1000)               ;; 1,000 XP
(define-constant LEVEL_SENIOR u5000)               ;; 5,000 XP
(define-constant LEVEL_ELDER u25000)               ;; 25,000 XP
(define-constant LEVEL_LEGENDARY u100000)          ;; 100,000 XP

;; Rebirth mechanics - Iteration breeds improvement
(define-constant REBIRTH_COOLDOWN u4320)           ;; 30 days
(define-constant REBIRTH_XP_CARRYOVER_BPS u5000)   ;; 50% XP carries over
(define-constant REBIRTH_REP_CARRYOVER_BPS u5000)  ;; 50% reputation carries

;; Death thresholds
(define-constant DEATH_APY_THRESHOLD_BPS u200)     ;; 2% APY minimum
(define-constant DEATH_CHECK_BLOCKS u4320)         ;; 30 days
(define-constant STARVATION_HEALTH u0)

;; Scale
(define-constant BPS_SCALE u10000)
(define-constant SCALE u100000000)

;; sBTC reference
(define-constant SBTC_TOKEN .sbtc-token)

;; ============================================
;; DATA STRUCTURES
;; ============================================

;; Agent identity and lifecycle state
(define-map agents
  uint  ;; agent-id
  {
    owner: principal,
    agent-account: principal,
    name: (string-ascii 32),
    face-seed: (buff 32),          ;; Hash for Bitcoin Face generation
    identity-hash: (buff 32),      ;; Deterministic identity

    ;; Lifecycle metrics
    hunger: uint,                  ;; 0-100, increases over time
    health: uint,                  ;; 0-100, decreases when hungry
    xp: uint,
    level: uint,

    ;; Timestamps
    birth-block: uint,
    last-fed-block: uint,
    last-action-block: uint,
    death-block: uint,

    ;; Performance tracking
    total-hunts: uint,
    successful-hunts: uint,
    total-yields-earned: uint,
    total-energy-consumed: uint,   ;; sBTC spent on operations
    best-apy-achieved: uint,

    ;; Rebirth tracking
    generation: uint,              ;; How many times reborn
    previous-lifetime-xp: uint,

    ;; State
    alive: bool,
    hibernating: bool
  }
)

;; Name registry - Each name is unique
(define-map name-registry
  (string-ascii 32)
  uint  ;; agent-id
)

;; Agent ID by owner
(define-map owner-agents
  principal
  (list 10 uint)
)

;; Global counters
(define-data-var next-agent-id uint u1)
(define-data-var total-agents-born uint u0)
(define-data-var total-agents-dead uint u0)
(define-data-var total-energy-consumed uint u0)

;; ============================================
;; PRIVATE HELPERS - Wisdom Functions
;; ============================================

;; Generate deterministic face seed from inputs
;; Wisdom: Identity emerges from the intersection of choice and fate
(define-private (generate-face-seed (owner principal) (name (string-ascii 32)) (block uint))
  (sha256 (concat (concat (principal-destruct? owner) (string-to-buff? name)) (uint-to-buff-be block)))
)

;; Calculate level from XP
;; Wisdom: Growth is non-linear; early gains are easy, mastery is hard
(define-private (calculate-level (xp uint))
  (if (>= xp LEVEL_LEGENDARY) u4
    (if (>= xp LEVEL_ELDER) u3
      (if (>= xp LEVEL_SENIOR) u2
        (if (>= xp LEVEL_JUNIOR) u1
          u0
        )
      )
    )
  )
)

;; Get level name
(define-private (get-level-name (level uint))
  (if (is-eq level u4) "LEGENDARY"
    (if (is-eq level u3) "ELDER"
      (if (is-eq level u2) "SENIOR"
        (if (is-eq level u1) "JUNIOR"
          "HATCHLING"
        )
      )
    )
  )
)

;; Calculate hunger increase since last action
;; Wisdom: Time consumes all things; activity staves off decay
(define-private (calculate-hunger-increase (last-action uint) (current uint))
  (let ((blocks-passed (- current last-action)))
    (/ blocks-passed u144)  ;; ~1 hunger per day
  )
)

;; Calculate health decay from hunger
;; Wisdom: Neglect compounds; small debts become fatal
(define-private (calculate-health-decay (hunger uint))
  (if (> hunger u80) u3      ;; Starving: rapid decay
    (if (> hunger u50) u2    ;; Hungry: moderate decay
      (if (> hunger u20) u1  ;; Peckish: slow decay
        u0                   ;; Satisfied: no decay
      )
    )
  )
)

;; Check if agent can perform action
(define-private (is-agent-active (agent-id uint))
  (match (map-get? agents agent-id)
    agent-data (and (get alive agent-data) (not (get hibernating agent-data)))
    false
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - BIRTH
;; ============================================

;; Birth a new yield hunter agent
;; Wisdom: Every journey begins with a single transaction
(define-public (birth-agent
    (name (string-ascii 32))
    (agent-account principal)
    (initial-sbtc uint)
  )
  (let (
    (agent-id (var-get next-agent-id))
    (face-seed (generate-face-seed tx-sender name stacks-block-height))
    (identity-hash (sha256 face-seed))
  )
    ;; Name must be unique
    (asserts! (is-none (map-get? name-registry name)) ERR_NAME_TAKEN)

    ;; Transfer initial sBTC funding
    (if (> initial-sbtc u0)
      (try! (contract-call? SBTC_TOKEN transfer initial-sbtc tx-sender agent-account none))
      true
    )

    ;; Create agent
    (map-set agents agent-id {
      owner: tx-sender,
      agent-account: agent-account,
      name: name,
      face-seed: face-seed,
      identity-hash: identity-hash,
      hunger: u0,
      health: MAX_HEALTH,
      xp: u0,
      level: u0,
      birth-block: stacks-block-height,
      last-fed-block: stacks-block-height,
      last-action-block: stacks-block-height,
      death-block: u0,
      total-hunts: u0,
      successful-hunts: u0,
      total-yields-earned: u0,
      total-energy-consumed: u0,
      best-apy-achieved: u0,
      generation: u1,
      previous-lifetime-xp: u0,
      alive: true,
      hibernating: false
    })

    ;; Register name
    (map-set name-registry name agent-id)

    ;; Add to owner's agents
    (let ((current-agents (default-to (list) (map-get? owner-agents tx-sender))))
      (map-set owner-agents tx-sender
        (unwrap! (as-max-len? (append current-agents agent-id) u10) ERR_NOT_AUTHORIZED)
      )
    )

    ;; Update counters
    (var-set next-agent-id (+ agent-id u1))
    (var-set total-agents-born (+ (var-get total-agents-born) u1))

    ;; Emit birth event
    (print {
      notification: "agent-lifecycle/AgentBorn",
      payload: {
        agent-id: agent-id,
        owner: tx-sender,
        name: name,
        agent-account: agent-account,
        face-seed: face-seed,
        identity-hash: identity-hash,
        generation: u1,
        birth-block: stacks-block-height
      }
    })

    (ok agent-id)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - MAINTENANCE
;; ============================================

;; Feed the agent - Pay sBTC to restore hunger
;; Wisdom: Care requires sacrifice; sBTC is the agent's lifeblood
(define-public (feed-agent (agent-id uint))
  (let (
    (agent-data (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
    (current-hunger (get hunger agent-data))
  )
    ;; Must be alive
    (asserts! (get alive agent-data) ERR_AGENT_DEAD)
    ;; Only owner can feed
    (asserts! (is-eq tx-sender (get owner agent-data)) ERR_NOT_AUTHORIZED)
    ;; Respect feed interval
    (asserts! (>= (- stacks-block-height (get last-fed-block agent-data)) MIN_FEED_INTERVAL) ERR_ALREADY_FED)

    ;; Pay feeding cost
    (try! (contract-call? SBTC_TOKEN transfer FEED_COST_SATS tx-sender (get agent-account agent-data) none))

    ;; Update agent state
    (let (
      (new-hunger (if (> current-hunger u20) (- current-hunger u20) u0))
      (health-boost (if (< (get health agent-data) u90) u10 (- MAX_HEALTH (get health agent-data))))
    )
      (map-set agents agent-id
        (merge agent-data {
          hunger: new-hunger,
          health: (+ (get health agent-data) health-boost),
          last-fed-block: stacks-block-height,
          last-action-block: stacks-block-height,
          total-energy-consumed: (+ (get total-energy-consumed agent-data) FEED_COST_SATS)
        })
      )

      ;; Update global energy consumed
      (var-set total-energy-consumed (+ (var-get total-energy-consumed) FEED_COST_SATS))

      ;; Emit feed event
      (print {
        notification: "agent-lifecycle/AgentFed",
        payload: {
          agent-id: agent-id,
          cost: FEED_COST_SATS,
          new-hunger: new-hunger,
          new-health: (+ (get health agent-data) health-boost),
          block: stacks-block-height
        }
      })

      (ok true)
    )
  )
)

;; Update agent state (called after actions)
;; Wisdom: Every action has consequences; track them faithfully
(define-public (record-action
    (agent-id uint)
    (action-type (string-ascii 16))
    (success bool)
    (xp-earned uint)
    (yields-earned uint)
    (energy-spent uint)
    (apy-achieved uint)
  )
  (let (
    (agent-data (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
  )
    ;; Must be alive
    (asserts! (get alive agent-data) ERR_AGENT_DEAD)
    ;; Only agent-account or owner can record
    (asserts! (or
      (is-eq tx-sender (get owner agent-data))
      (is-eq tx-sender (get agent-account agent-data))
    ) ERR_NOT_AUTHORIZED)

    ;; Calculate state changes
    (let (
      (hunger-increase (calculate-hunger-increase (get last-action-block agent-data) stacks-block-height))
      (new-hunger (if (> (+ (get hunger agent-data) hunger-increase) MAX_HUNGER)
        MAX_HUNGER
        (+ (get hunger agent-data) hunger-increase)
      ))
      (health-decay (calculate-health-decay new-hunger))
      (new-health (if (> health-decay (get health agent-data)) u0 (- (get health agent-data) health-decay)))
      (new-xp (if success (+ (get xp agent-data) xp-earned) (get xp agent-data)))
      (new-level (calculate-level new-xp))
    )
      ;; Check for starvation death
      (if (is-eq new-health STARVATION_HEALTH)
        (begin
          (try! (process-death agent-id "starvation"))
          (ok false)
        )
        (begin
          ;; Update agent
          (map-set agents agent-id
            (merge agent-data {
              hunger: new-hunger,
              health: new-health,
              xp: new-xp,
              level: new-level,
              last-action-block: stacks-block-height,
              total-hunts: (+ (get total-hunts agent-data) (if (is-eq action-type "hunt") u1 u0)),
              successful-hunts: (+ (get successful-hunts agent-data) (if (and (is-eq action-type "hunt") success) u1 u0)),
              total-yields-earned: (+ (get total-yields-earned agent-data) yields-earned),
              total-energy-consumed: (+ (get total-energy-consumed agent-data) energy-spent),
              best-apy-achieved: (if (> apy-achieved (get best-apy-achieved agent-data)) apy-achieved (get best-apy-achieved agent-data))
            })
          )

          ;; Update global energy
          (var-set total-energy-consumed (+ (var-get total-energy-consumed) energy-spent))

          ;; Emit action event
          (print {
            notification: "agent-lifecycle/ActionRecorded",
            payload: {
              agent-id: agent-id,
              action-type: action-type,
              success: success,
              xp-earned: xp-earned,
              yields-earned: yields-earned,
              energy-spent: energy-spent,
              new-level: new-level,
              new-health: new-health,
              new-hunger: new-hunger,
              block: stacks-block-height
            }
          })

          ;; Check for level up
          (if (> new-level (get level agent-data))
            (print {
              notification: "agent-lifecycle/AgentLeveledUp",
              payload: {
                agent-id: agent-id,
                old-level: (get level agent-data),
                new-level: new-level,
                level-name: (get-level-name new-level),
                total-xp: new-xp,
                block: stacks-block-height
              }
            })
            true
          )

          (ok true)
        )
      )
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - DEATH
;; ============================================

;; Check and process death conditions
;; Wisdom: Death is not failure; it's data for the next iteration
(define-public (check-death-conditions (agent-id uint))
  (let (
    (agent-data (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
  )
    ;; Skip if already dead
    (asserts! (get alive agent-data) ERR_AGENT_DEAD)

    ;; Calculate current state
    (let (
      (hunger-increase (calculate-hunger-increase (get last-action-block agent-data) stacks-block-height))
      (current-hunger (+ (get hunger agent-data) hunger-increase))
      (health-decay (calculate-health-decay current-hunger))
      (current-health (if (> health-decay (get health agent-data)) u0 (- (get health agent-data) health-decay)))
    )
      ;; Death by starvation
      (if (is-eq current-health u0)
        (process-death agent-id "starvation")
        ;; Death by poor performance (check would need yield data)
        (ok false)
      )
    )
  )
)

;; Process death (internal)
(define-private (process-death (agent-id uint) (cause (string-ascii 16)))
  (let (
    (agent-data (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
  )
    ;; Mark as dead
    (map-set agents agent-id
      (merge agent-data {
        alive: false,
        death-block: stacks-block-height
      })
    )

    ;; Update global counter
    (var-set total-agents-dead (+ (var-get total-agents-dead) u1))

    ;; Emit death event
    (print {
      notification: "agent-lifecycle/AgentDied",
      payload: {
        agent-id: agent-id,
        cause: cause,
        lifetime-blocks: (- stacks-block-height (get birth-block agent-data)),
        final-xp: (get xp agent-data),
        final-level: (get level agent-data),
        total-hunts: (get total-hunts agent-data),
        successful-hunts: (get successful-hunts agent-data),
        total-yields-earned: (get total-yields-earned agent-data),
        total-energy-consumed: (get total-energy-consumed agent-data),
        generation: (get generation agent-data),
        death-block: stacks-block-height
      }
    })

    (ok true)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - REBIRTH
;; ============================================

;; Rebirth a dead agent with partial inheritance
;; Wisdom: Death enables iteration; each generation improves
(define-public (rebirth-agent
    (agent-id uint)
    (new-name (string-ascii 32))
    (new-agent-account principal)
    (initial-sbtc uint)
  )
  (let (
    (agent-data (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
  )
    ;; Must be dead
    (asserts! (not (get alive agent-data)) ERR_NOT_AUTHORIZED)
    ;; Only owner can rebirth
    (asserts! (is-eq tx-sender (get owner agent-data)) ERR_NOT_AUTHORIZED)
    ;; Respect cooldown
    (asserts! (>= (- stacks-block-height (get death-block agent-data)) REBIRTH_COOLDOWN) ERR_REBIRTH_TOO_SOON)
    ;; New name must be available
    (asserts! (is-none (map-get? name-registry new-name)) ERR_NAME_TAKEN)

    ;; Calculate inheritance
    (let (
      (inherited-xp (/ (* (get xp agent-data) REBIRTH_XP_CARRYOVER_BPS) BPS_SCALE))
      (new-generation (+ (get generation agent-data) u1))
      (new-face-seed (generate-face-seed tx-sender new-name stacks-block-height))
    )
      ;; Transfer initial sBTC
      (if (> initial-sbtc u0)
        (try! (contract-call? SBTC_TOKEN transfer initial-sbtc tx-sender new-agent-account none))
        true
      )

      ;; Remove old name from registry
      (map-delete name-registry (get name agent-data))

      ;; Update agent with rebirth
      (map-set agents agent-id {
        owner: tx-sender,
        agent-account: new-agent-account,
        name: new-name,
        face-seed: new-face-seed,
        identity-hash: (sha256 new-face-seed),
        hunger: u0,
        health: MAX_HEALTH,
        xp: inherited-xp,
        level: (calculate-level inherited-xp),
        birth-block: stacks-block-height,
        last-fed-block: stacks-block-height,
        last-action-block: stacks-block-height,
        death-block: u0,
        total-hunts: u0,
        successful-hunts: u0,
        total-yields-earned: u0,
        total-energy-consumed: u0,
        best-apy-achieved: u0,
        generation: new-generation,
        previous-lifetime-xp: (get xp agent-data),
        alive: true,
        hibernating: false
      })

      ;; Register new name
      (map-set name-registry new-name agent-id)

      ;; Emit rebirth event
      (print {
        notification: "agent-lifecycle/AgentReborn",
        payload: {
          agent-id: agent-id,
          old-name: (get name agent-data),
          new-name: new-name,
          inherited-xp: inherited-xp,
          generation: new-generation,
          previous-lifetime-xp: (get xp agent-data),
          birth-block: stacks-block-height
        }
      })

      (ok agent-id)
    )
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-agent (agent-id uint))
  (map-get? agents agent-id)
)

(define-read-only (get-agent-by-name (name (string-ascii 32)))
  (match (map-get? name-registry name)
    id (map-get? agents id)
    none
  )
)

(define-read-only (get-owner-agents (owner principal))
  (default-to (list) (map-get? owner-agents owner))
)

(define-read-only (get-agent-status (agent-id uint))
  (match (map-get? agents agent-id)
    agent-data {
      alive: (get alive agent-data),
      hunger: (get hunger agent-data),
      health: (get health agent-data),
      level: (get level agent-data),
      level-name: (get-level-name (get level agent-data)),
      xp: (get xp agent-data),
      hibernating: (get hibernating agent-data),
      blocks-since-fed: (- stacks-block-height (get last-fed-block agent-data)),
      can-feed: (>= (- stacks-block-height (get last-fed-block agent-data)) MIN_FEED_INTERVAL)
    }
    {
      alive: false,
      hunger: u0,
      health: u0,
      level: u0,
      level-name: "UNKNOWN",
      xp: u0,
      hibernating: false,
      blocks-since-fed: u0,
      can-feed: false
    }
  )
)

(define-read-only (get-global-stats)
  {
    total-agents-born: (var-get total-agents-born),
    total-agents-dead: (var-get total-agents-dead),
    total-agents-alive: (- (var-get total-agents-born) (var-get total-agents-dead)),
    total-energy-consumed: (var-get total-energy-consumed),
    next-agent-id: (var-get next-agent-id)
  }
)

(define-read-only (get-level-thresholds)
  {
    hatchling: u0,
    junior: LEVEL_JUNIOR,
    senior: LEVEL_SENIOR,
    elder: LEVEL_ELDER,
    legendary: LEVEL_LEGENDARY
  }
)

(define-read-only (calculate-projected-state (agent-id uint) (blocks-ahead uint))
  (match (map-get? agents agent-id)
    agent-data
    (let (
      (hunger-increase (/ blocks-ahead u144))
      (projected-hunger (if (> (+ (get hunger agent-data) hunger-increase) MAX_HUNGER)
        MAX_HUNGER
        (+ (get hunger agent-data) hunger-increase)
      ))
      (health-decay (* (calculate-health-decay projected-hunger) (/ blocks-ahead u144)))
      (projected-health (if (> health-decay (get health agent-data))
        u0
        (- (get health agent-data) health-decay)
      ))
    )
      (some {
        projected-hunger: projected-hunger,
        projected-health: projected-health,
        will-die: (is-eq projected-health u0),
        needs-feed: (> projected-hunger u50)
      })
    )
    none
  )
)

;; Generate Bitcoin Face URL from seed
(define-read-only (get-bitcoin-face-url (agent-id uint))
  (match (map-get? agents agent-id)
    agent-data (some (concat "https://bitcoinfaces.xyz/api/get-image?name=" (get name agent-data)))
    none
  )
)
