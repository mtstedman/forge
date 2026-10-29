PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    alt_text TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body_markdown TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories) AND json_type(categories) = 'array'),
    tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
    faq TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faq) AND json_type(faq) = 'array'),
    meta_title TEXT,
    meta_description TEXT,
    cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    comments_enabled INTEGER NOT NULL DEFAULT 0 CHECK (comments_enabled IN (0, 1)),
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_email TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    ip_hash TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    moderated_at TEXT
);

-- Pending edits to a published post. The posts row stays the live record that public
-- readers see; at most one pending draft per post holds the latest saved editable
-- values until it is published (promoted into posts) or unpublished. Deleting the post
-- removes its pending draft.
CREATE TABLE IF NOT EXISTS post_drafts (
    post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body_markdown TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories) AND json_type(categories) = 'array'),
    tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
    faq TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faq) AND json_type(faq) = 'array'),
    meta_title TEXT,
    meta_description TEXT,
    cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT '',
    comments_enabled INTEGER NOT NULL DEFAULT 0 CHECK (comments_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Reusable admin vocabulary. Entries are additive: they persist with post saves
-- and stay available after a post deselects them or is deleted.
CREATE TABLE IF NOT EXISTS taxonomy_terms (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('category', 'tag')),
    name TEXT NOT NULL CHECK (name <> ''),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (kind, name)
);

CREATE INDEX IF NOT EXISTS idx_posts_status_published_at
    ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_comments_post_id_status
    ON comments(post_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_ip_hash_created_at
    ON comments(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS consultation_requests (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    best_time TEXT NOT NULL CHECK (best_time IN ('Morning', 'Midday', 'Afternoon', 'Evening')),
    message TEXT NOT NULL DEFAULT '',
    consented_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'ignored')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    resolved_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_consultation_requests_status_created_at
    ON consultation_requests(status, created_at, id);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
    ON admin_sessions(expires_at);

-- Editable main-page copy: one singleton row (id = 1) holding the complete
-- MainPageContent JSON document (plain text and ordered repeaters only). The seed
-- reproduces the current home-page copy; INSERT OR IGNORE keeps reapplied schema
-- runs from overwriting an administrator-edited document.
CREATE TABLE IF NOT EXISTS main_page_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    document TEXT NOT NULL CHECK (json_valid(document) AND json_type(document) = 'object'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO main_page_content (id, document) VALUES (1, json('{
    "seo": {
        "title": "Forge Performance Therapy — Twin Cities",
        "description": "One-on-one mobile physical therapy, rehabilitation and performance care with Dr. Joseph Sperlak, PT, DPT, CSCS across the Twin Cities."
    },
    "hero": {
        "eyebrow": "",
        "heading": "Find the root cause. Then forge your path to recovery.",
        "introduction": "Private, one-on-one physical therapy with Dr. Joseph Sperlak, PT, DPT, CSCS. Full 60-minute sessions at your home or gym, with the same provider every appointment.",
        "primary_cta_label": "Book a free 15-min phone consult",
        "secondary_cta_label": "What I treat",
        "credential_chips": ["DPT", "CSCS"],
        "location_chip": "Twin Cities Metro, MN",
        "image_alt": "Photo placeholder: Joseph treating a patient at home or in a gym"
    },
    "approach": {
        "eyebrow": "I. Approach",
        "title": "Treatment built around you, not a clinic schedule.",
        "description": "Every plan starts by identifying the root cause of your pain and dysfunction. From there, you get a specialized rehabilitation protocol designed to support sustainable lifestyle changes.",
        "principles": [
            {
                "marker": "60",
                "title": "Full 60-minute sessions",
                "description": "One-on-one for the entire hour. No aides, no splitting time between patients."
            },
            {
                "marker": "1",
                "title": "Same provider, every visit",
                "description": "You work with Dr. Sperlak from the first assessment to your final session."
            },
            {
                "marker": "§",
                "title": "Root cause, then protocol",
                "description": "A thorough assessment drives a rehabilitation plan specific to your body and goals."
            },
            {
                "marker": "—",
                "title": "Conservative care first",
                "description": "The goal is to help you avoid unnecessary injections and surgeries."
            }
        ],
        "service_area": "Serving the Twin Cities Metro Area"
    },
    "services": {
        "eyebrow": "II. Services & conditions",
        "title": "What I treat",
        "items": [
            {
                "number": "i.",
                "title": "Sports injuries",
                "description": "Sprains, strains, tendon pain and overuse injuries, with a return-to-sport plan for training and competition."
            },
            {
                "number": "ii.",
                "title": "Post-surgical rehab",
                "description": "Structured recovery after joint, ligament and spine procedures, progressing from early mobility to full strength."
            },
            {
                "number": "iii.",
                "title": "Back & neck pain",
                "description": "Assessment of posture, movement and load to address the source of spinal pain, not only the symptoms."
            },
            {
                "number": "iv.",
                "title": "Chronic pain",
                "description": "Gradual, measurable plans for long-standing pain that hasn''t resolved with rest, medication or prior treatment."
            },
            {
                "number": "v.",
                "title": "Performing arts & dancers",
                "description": "Care for the range, control and repetitive demands of dance and performance, built around rehearsal schedules."
            },
            {
                "number": "vi.",
                "title": "Work injuries",
                "description": "Rehab for lifting, repetitive-motion and job-related injuries, focused on a safe return to full duty."
            }
        ]
    },
    "about": {
        "eyebrow": "III. About",
        "title": "",
        "name": "Dr. Joseph Sperlak",
        "suffix": "PT, DPT, CSCS",
        "role": "Founder",
        "biography": "Joseph is a Doctor of Physical Therapy and Certified Strength & Conditioning Specialist. He trains and competes himself, so he understands what it takes to get back to the work you care about.",
        "portrait_alt": "Portrait placeholder for Dr. Joseph Sperlak",
        "credentials": [
            {"credential": "Doctor of Physical Therapy", "label": "DPT"},
            {"credential": "Certified Strength & Conditioning Specialist", "label": "CSCS"},
            {"credential": "Collegiate strength & conditioning coach", "label": "Coaching"},
            {"credential": "Self-trained Ironman & Strongman athlete", "label": "Athlete"},
            {"credential": "Hyrox competitor", "label": "Athlete"}
        ]
    },
    "pricing": {
        "eyebrow": "IV. Getting started & pricing",
        "title": "Three steps to a plan",
        "description": "Forge is a cash-based, out-of-network practice. Pricing is simple and shared up front.",
        "items": [
            {
                "step": "Step 1",
                "title": "Free phone consult",
                "price": "$0",
                "detail": "15 min",
                "description": "Talk through what''s going on and whether Forge is the right fit.",
                "featured": false
            },
            {
                "step": "Step 2",
                "title": "In-person initial consultation",
                "price": "$49.99",
                "detail": "",
                "description": "A hands-on assessment at your home or gym to identify the root cause of your pain.",
                "featured": true
            },
            {
                "step": "Step 3",
                "title": "Your protocol",
                "price": "60",
                "detail": "min sessions",
                "description": "A specialized rehabilitation plan with one-on-one sessions, always with the same provider.",
                "featured": false
            }
        ]
    },
    "testimonials": {
        "eyebrow": "V. Patient stories",
        "title": "In their words",
        "items": [
            {
                "quote": "Placeholder testimonial. Replace with a patient quote about recovering from a sports injury.",
                "attribution": "Patient name, sports injury"
            },
            {
                "quote": "Placeholder testimonial. Replace with a patient quote about post-surgical rehab.",
                "attribution": "Patient name, post-surgical rehab"
            },
            {
                "quote": "Placeholder testimonial. Replace with a patient quote about chronic back pain.",
                "attribution": "Patient name, chronic pain"
            }
        ]
    },
    "resources": {
        "eyebrow": "Latest resources",
        "title": "Notes from the training floor",
        "description": "",
        "all_resources_label": "View all resources",
        "unavailable_message": "Please visit the resources page again soon. The rest of the site is ready for you.",
        "empty_message": "New articles are on the way. Visit the resources page again soon.",
        "category_fallback": "Resource",
        "read_article_label": "Read article"
    },
    "faq": {
        "eyebrow": "VI. Questions",
        "title": "Common questions",
        "items": [
            {
                "question": "Do I need a doctor''s referral?",
                "answer": "Minnesota allows direct access to physical therapy, so you can typically start without a referral. We''ll confirm what applies to you during the phone consult."
            },
            {
                "question": "Do you take insurance?",
                "answer": "Forge is a cash-based, out-of-network practice. You pay at the time of service. If your plan offers out-of-network benefits, you can request documentation to submit for possible reimbursement."
            },
            {
                "question": "What does the $49.99 initial consultation include?",
                "answer": "An in-person assessment at your home or gym to identify the root cause of your pain or dysfunction, followed by a recommended rehabilitation plan."
            },
            {
                "question": "Where do sessions take place?",
                "answer": "At your home, your gym, or on-field, anywhere in the Twin Cities Metro Area. There is no clinic to travel to."
            },
            {
                "question": "How long is each session?",
                "answer": "Every session is a full 60 minutes, one-on-one with Dr. Sperlak."
            },
            {
                "question": "How many visits will I need?",
                "answer": "It depends on your condition and goals. You''ll get a clear plan after your initial consultation, designed for lasting results rather than an open-ended schedule."
            }
        ],
        "cta_prefix": "Don''t see yours?",
        "cta_label": "Ask during your free phone consult."
    },
    "contact": {
        "eyebrow": "VII. Contact",
        "title": "Book a free 15-minute phone consult.",
        "description": "Leave your details and Joseph will call you back to talk through your goals and next steps.",
        "phone": "(612) 555-0148",
        "email": "hello@forgeperformance.com",
        "service_area": "Twin Cities Metro Area",
        "venue": "Your home or gym",
        "form": {
            "name_label": "Name",
            "phone_label": "Phone",
            "email_label": "Email",
            "email_optional_label": "(optional)",
            "best_time_label": "Best time to call",
            "message_label": "What''s going on?",
            "message_optional_label": "(optional)",
            "consent_label": "I agree to share this information with Forge Performance Therapy for the purpose of contacting me about my consultation only. Forge will never sell or share the information I submit.",
            "submit_label": "Request my free consult",
            "sending_label": "Sending…",
            "success_message": "Thank you. Your request was received, and Joseph will contact you to schedule your free consultation.",
            "generic_error_message": "Your request could not be sent. Your details are still here, so please try again, or call (612) 555-0148 or email hello@forgeperformance.com.",
            "captcha_retry_message": "The security check wasn''t accepted. Please complete it again and resend."
        }
    }
}'));
