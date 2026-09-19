"""
Pre-seeded collective knowledge cue cards attributed to teammate 'Sam'.
Used for the Collective Knowledge Pool demo (e.g. asking Cue about Sam's payment retry architecture).
"""

SAM_CUE_CARDS = [
    {
        "id": "sam-card-payment-backoff",
        "author": "Sam",
        "author_role": "Senior Backend Engineer",
        "file": "services/payment_retry.py",
        "timestamp": "Sep 12, 2026, 02:22 PM",
        "category": "architecture",
        "plain_title": "Spread out retries with random delays so the payment gateway doesn't get flooded",
        "analogy": "Like spacing out cars merging onto a highway so they don't all jam into the tollbooth at the exact same second.",
        "decision": "Implement exponential backoff with full randomized jitter for failed payment retries instead of fixed-interval polling.",
        "why": "When Stripe or bank gateways suffer transient degradations, thousands of simultaneous customer retries at fixed intervals cause a thundering herd spike that knocks recovering gateways back offline. Full jitter randomizes delays (1s-30s) to smoothly spread gateway load.",
        "mentor_tip": "Always add randomized jitter to retry intervals when interacting with third-party payment APIs to avoid recreating the outage you're trying to recover from.",
        "alternatives": [
            {
                "option": "Fixed 5-second interval retries",
                "pros": ["Predictable debugging in logs", "Trivial to implement with simple timer loops"],
                "cons": ["Causes thundering herd traffic spikes that re-crash recovering payment gateways"]
            },
            {
                "option": "Immediate Dead Letter Queue (DLQ) without retries",
                "pros": ["Zero backend worker thread blocking"],
                "cons": ["Fails transient network hiccups that would have succeeded on a 2-second retry, hurting payment success rate"]
            }
        ],
        "quiz": {
            "question": "Why did Sam add randomized jitter to the payment retry backoff?",
            "options": [
                "To prevent synchronized retry spikes from overwhelming recovering payment gateways (thundering herd)",
                "To bypass Stripe API authentication rate limits",
                "Because Stripe webhooks require randomized delay headers"
            ],
            "correct_index": 0
        }
    },
    {
        "id": "sam-card-error-classification",
        "author": "Sam",
        "author_role": "Senior Backend Engineer",
        "file": "services/payment_retry.py",
        "timestamp": "Sep 12, 2026, 04:45 PM",
        "category": "api-design",
        "plain_title": "Fail immediately on bad card numbers; only retry temporary network glitches",
        "analogy": "If a key doesn't fit a lock, trying it 5 more times won't open the door. Only retry if the lock was temporarily frozen.",
        "decision": "Classify gateway responses into transient errors (503, timeouts, 429) which are retried, versus terminal errors (card_declined, insufficient_funds, invalid_cvc) which fail immediately.",
        "why": "Retrying a card that was declined for insufficient funds or an invalid CVV will never succeed on retry and risks triggering banking fraud detection rules and extra gateway fees. We only retry transient 5xx server errors and network timeouts.",
        "mentor_tip": "Never retry 4xx customer errors like expired cards or wrong billing zip codes—fail fast and inform the customer immediately so they can update their card.",
        "alternatives": [
            {
                "option": "Indiscriminately retry all failed transactions up to 3 times",
                "pros": ["Catches rare false-positive bank decline glitches"],
                "cons": ["Flags our merchant account with card network fraud warnings and incurs wasteful gateway retry fees"]
            }
        ],
        "quiz": {
            "question": "Which error type does Sam's retry policy explicitly fail immediately without retrying?",
            "options": [
                "Terminal errors like card_declined and insufficient_funds",
                "HTTP 503 Service Unavailable",
                "HTTP 429 Gateway Rate Limit"
            ],
            "correct_index": 0
        }
    },
    {
        "id": "sam-card-idempotency-keys",
        "author": "Sam",
        "author_role": "Senior Backend Engineer",
        "file": "services/idempotency.py",
        "timestamp": "Sep 13, 2026, 10:15 AM",
        "category": "data-structure",
        "plain_title": "Remember transaction IDs for 24 hours to prevent double-charging or duplicate billing",
        "analogy": "Like getting a numbered receipt at a coffee shop so you never get handed two drinks and charged twice.",
        "decision": "Store payment idempotency keys with request payloads in Redis with a 24-hour TTL before executing any gateway retry.",
        "why": "If our checkout worker times out waiting for Stripe's response while Stripe actually processed the charge, resending the same idempotency key guarantees Stripe returns the existing charge result without double-billing the customer.",
        "mentor_tip": "Idempotency keys must be tied to the unique customer checkout intent, never generated anew on each retry attempt.",
        "alternatives": [
            {
                "option": "PostgreSQL relational table for idempotency tracking",
                "pros": ["Permanent transactional persistence with ACID guarantees"],
                "cons": ["Adds heavy write/read locking to primary DB during flash sales and checkout rushes"]
            },
            {
                "option": "Stateless client-generated timestamps",
                "pros": ["No server-side cache storage required"],
                "cons": ["Cannot guarantee single-charge execution across asynchronous worker retries"]
            }
        ],
        "quiz": {
            "question": "Why is the idempotency key cached in Redis across retries?",
            "options": [
                "To ensure that network-delayed retries cannot cause duplicate customer charges",
                "To speed up database index searches",
                "To allow customers to edit their cart after payment"
            ],
            "correct_index": 0
        }
    },
    {
        "id": "sam-card-circuit-breaker",
        "author": "Sam",
        "author_role": "Senior Backend Engineer",
        "file": "services/circuit_breaker.py",
        "timestamp": "Sep 13, 2026, 03:30 PM",
        "category": "architecture",
        "plain_title": "Emergency safety switch that cuts off payment traffic if Stripe crashes",
        "analogy": "Like the circuit breaker fuse in your home that flips off during an electrical surge so your house doesn't catch fire.",
        "decision": "Wrap outbound payment requests in a 3-state Circuit Breaker (CLOSED, OPEN, HALF-OPEN) that trips after 5 consecutive 5xx failures within 30 seconds.",
        "why": "During a total Stripe or banking rail outage, retrying every payment 3 times with exponential backoff quickly exhausts our Celery/Flask worker threads. The circuit breaker trips OPEN to immediately shed load and queue payments for delayed batch processing.",
        "mentor_tip": "Circuit breakers protect your internal service pools from cascading collapse when a third-party vendor is completely down.",
        "alternatives": [
            {
                "option": "Global retry counter without circuit breaker pattern",
                "pros": ["Simpler logic with no state machine transitions"],
                "cons": ["Worker threads exhaust memory and connection pools during prolonged third-party outages"]
            }
        ],
        "quiz": {
            "question": "What triggers Sam's payment circuit breaker to trip into the OPEN state?",
            "options": [
                "5 consecutive gateway 5xx failures within a 30-second window",
                "A single card decline from an international bank",
                "When Redis memory utilization exceeds 80%"
            ],
            "correct_index": 0
        }
    }
]
