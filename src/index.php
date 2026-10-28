<?php

declare(strict_types=1);

use Forge\Site\ApiClient;
use Forge\Site\Layout;
use Forge\Site\SiteConfig;

require_once __DIR__ . '/includes/bootstrap.php';

$siteUrl = rtrim(SiteConfig::get('SITE_URL', 'http://localhost') ?? 'http://localhost', '/');
$apiBaseUrl = SiteConfig::get('API_BASE_URL');
$postsPromise = null;

if ($apiBaseUrl !== null && $apiBaseUrl !== '') {
    try {
        $postsPromise = (new ApiClient($apiBaseUrl))->getPostsAsync(1, 3);
    } catch (Throwable) {
        $postsPromise = null;
    }
}

$meta = [
    'title' => 'Forge Performance Therapy | Mobile Physical Therapy in the Twin Cities',
    'description' => 'One-on-one mobile physical therapy, rehabilitation and performance care with Dr. Joseph Sperlak, PT, DPT, CSCS across the Twin Cities.',
    'canonical' => $siteUrl . '/',
    'type' => 'website',
    'site_name' => 'Forge Performance Therapy',
    'json_ld' => [
        '@context' => 'https://schema.org',
        '@graph' => [
            [
                '@type' => ['Organization', 'LocalBusiness'],
                '@id' => $siteUrl . '/#organization',
                'name' => 'Forge Performance Therapy',
                'url' => $siteUrl . '/',
                'email' => 'hello@forgeperformance.com',
                'telephone' => '+1-612-555-0148',
                'description' => 'Mobile, one-on-one physical therapy and performance rehabilitation in the Twin Cities metro area.',
                'areaServed' => [
                    '@type' => 'AdministrativeArea',
                    'name' => 'Twin Cities Metro Area, Minnesota',
                ],
                'founder' => [
                    '@type' => 'Person',
                    'name' => 'Dr. Joseph Sperlak',
                    'honorificSuffix' => 'PT, DPT, CSCS',
                ],
            ],
            [
                '@type' => 'WebSite',
                '@id' => $siteUrl . '/#website',
                'url' => $siteUrl . '/',
                'name' => 'Forge Performance Therapy',
                'publisher' => ['@id' => $siteUrl . '/#organization'],
            ],
        ],
    ],
];

$escape = static fn (mixed $value): string => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
$formatDate = static function (mixed $value): string {
    if (!is_string($value) || $value === '') {
        return '';
    }

    try {
        return (new DateTimeImmutable($value))->format('M j, Y');
    } catch (Throwable) {
        return '';
    }
};

Layout::header($meta, 'home');
?>
<main id="main-content" class="page-shell">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__copy">
      <span class="eyebrow">Mobile physical therapy · Twin Cities</span>
      <h1 id="hero-title">Rehab built for the life you want to <em>get back to.</em></h1>
      <p>One-on-one physical therapy that finds the source of pain, rebuilds strength and prepares you for the work, sport and movement that matter to you.</p>
      <div class="hero__actions">
        <a class="button button--outline" href="#contact">Book a free 15-minute phone consult</a>
        <a class="button button--dark" href="#approach">See the approach</a>
      </div>
      <div class="hero__facts" aria-label="Practice highlights">
        <span>Doctor-led care</span>
        <span>Your home or gym</span>
        <span>Full 60-minute sessions</span>
      </div>
    </div>
    <figure class="photo-placeholder" role="img" aria-label="Portrait placeholder for Dr. Joseph Sperlak"></figure>
  </section>

  <section id="approach" class="section approach-grid" aria-labelledby="approach-title">
    <div class="approach-grid__intro">
      <span class="eyebrow">I. The Forge approach</span>
      <h2 id="approach-title" class="section-title">Treat the cause. Train the solution.</h2>
      <p class="section-lede">Care is built around how your body moves in the real world, not a generic protocol or a crowded clinic schedule.</p>
    </div>
    <div class="principles">
      <article class="principle">
        <div>
          <h3>Find the pattern</h3>
          <p>A full movement and load assessment looks beyond the painful spot to understand why the problem keeps returning.</p>
        </div>
      </article>
      <article class="principle">
        <div>
          <h3>Build a clear plan</h3>
          <p>Your protocol is specific to your goals, schedule and environment, with measurable milestones from the first session onward.</p>
        </div>
      </article>
      <article class="principle">
        <div>
          <h3>Return with confidence</h3>
          <p>Rehab progresses into strength and conditioning so you are prepared for the demands of sport, work and everyday life.</p>
        </div>
      </article>
    </div>
  </section>

  <section id="services" class="section services" aria-labelledby="services-title">
    <div class="services__intro">
      <div class="section-heading">
        <span class="eyebrow">II. What Forge treats</span>
        <h2 id="services-title" class="section-title">Care for pain, recovery and performance.</h2>
      </div>
      <p class="section-lede">Every plan starts with the demands you need to meet, whether that is a competition, a rehearsal, a workday or simply moving without hesitation.</p>
    </div>
    <div class="services__list">
      <article class="service-item"><span class="service-item__number">i.</span><div><h3>Sports injuries</h3><p>Sprains, strains, tendon pain and overuse injuries, with a return-to-sport plan for training and competition.</p></div></article>
      <article class="service-item"><span class="service-item__number">ii.</span><div><h3>Post-surgical rehab</h3><p>Structured recovery after joint, ligament and spine procedures, progressing from early mobility to full strength.</p></div></article>
      <article class="service-item"><span class="service-item__number">iii.</span><div><h3>Back &amp; neck pain</h3><p>Assessment of posture, movement and load to address the source of spinal pain, not only the symptoms.</p></div></article>
      <article class="service-item"><span class="service-item__number">iv.</span><div><h3>Chronic pain</h3><p>Gradual, measurable plans for long-standing pain that hasn't resolved with rest, medication or prior treatment.</p></div></article>
      <article class="service-item"><span class="service-item__number">v.</span><div><h3>Performing arts &amp; dancers</h3><p>Care for the range, control and repetitive demands of dance and performance, built around rehearsal schedules.</p></div></article>
      <article class="service-item"><span class="service-item__number">vi.</span><div><h3>Work injuries</h3><p>Rehab for lifting, repetitive-motion and job-related injuries, focused on a safe return to full duty.</p></div></article>
    </div>
  </section>

  <section id="about" class="section about-grid" aria-labelledby="about-title">
    <figure class="photo-placeholder portrait-placeholder" role="img" aria-label="Portrait placeholder for Dr. Joseph Sperlak"></figure>
    <div class="about-copy">
      <span class="eyebrow">III. About</span>
      <div class="about-copy__name">
        <h2 id="about-title">Dr. Joseph Sperlak</h2>
        <span>PT, DPT, CSCS · Founder</span>
      </div>
      <p>Joseph is a Doctor of Physical Therapy and Certified Strength &amp; Conditioning Specialist. He trains and competes himself, so he understands what it takes to get back to the work you care about.</p>
      <table class="credentials">
        <tbody>
          <tr><td>Doctor of Physical Therapy</td><td>DPT</td></tr>
          <tr><td>Certified Strength &amp; Conditioning Specialist</td><td>CSCS</td></tr>
          <tr><td>Collegiate strength &amp; conditioning coach</td><td>Coaching</td></tr>
          <tr><td>Self-trained Ironman &amp; Strongman athlete</td><td>Athlete</td></tr>
          <tr><td>Hyrox competitor</td><td>Athlete</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="pricing" class="section pricing" aria-labelledby="pricing-title">
    <div class="pricing__heading">
      <div class="section-heading">
        <span class="eyebrow">IV. Getting started &amp; pricing</span>
        <h2 id="pricing-title" class="section-title">Three steps to a plan</h2>
      </div>
      <p class="section-lede">Forge is a cash-based, out-of-network practice. Pricing is simple and shared up front.</p>
    </div>
    <div class="pricing-cards">
      <article class="card">
        <span class="card__kicker">Step 1</span>
        <h3>Free phone consult</h3>
        <span class="card__price">$0 <small>15 min</small></span>
        <p>Talk through what's going on and whether Forge is the right fit.</p>
      </article>
      <article class="card card--featured">
        <span class="card__kicker">Step 2</span>
        <h3>In-person initial consultation</h3>
        <span class="card__price">$49.99</span>
        <p>A hands-on assessment at your home or gym to identify the root cause of your pain.</p>
      </article>
      <article class="card">
        <span class="card__kicker">Step 3</span>
        <h3>Your protocol</h3>
        <span class="card__price">60 <small>min sessions</small></span>
        <p>A specialized rehabilitation plan with one-on-one sessions, always with the same provider.</p>
      </article>
    </div>
  </section>

  <section id="reviews" class="section testimonials" aria-labelledby="reviews-title">
    <div class="section-heading">
      <span class="eyebrow">V. Patient stories</span>
      <h2 id="reviews-title" class="section-title">In their words</h2>
    </div>
    <div class="quotes">
      <figure class="quote"><blockquote>“I felt listened to, understood the plan and knew exactly what I needed to do between sessions.”</blockquote><figcaption>— Forge patient, sports injury</figcaption></figure>
      <figure class="quote"><blockquote>“The goal was never just less pain. We rebuilt the strength and confidence I needed to train again.”</blockquote><figcaption>— Forge patient, post-surgical rehab</figcaption></figure>
      <figure class="quote"><blockquote>“Having care come to my gym made the work specific, practical and easy to carry into my routine.”</blockquote><figcaption>— Forge patient, back pain</figcaption></figure>
    </div>
  </section>

<?php
$posts = [];
if ($postsPromise !== null) {
    try {
        $postsResponse = $postsPromise->wait();
        if (is_array($postsResponse) && isset($postsResponse['data']) && is_array($postsResponse['data'])) {
            $posts = array_values(array_filter($postsResponse['data'], 'is_array'));
        }
    } catch (Throwable) {
        $posts = [];
    }
}
?>
  <section id="resources" class="section resources" aria-labelledby="resources-title">
    <div class="resources__heading">
      <div class="section-heading">
        <span class="eyebrow">Latest resources</span>
        <h2 id="resources-title" class="section-title">Notes from the training floor</h2>
      </div>
      <a class="button button--text" href="/resources/">View all resources →</a>
    </div>
    <?php if ($posts === []): ?>
      <div class="resources-empty">
        <p>New articles are on the way. Visit the resources page again soon.</p>
      </div>
    <?php else: ?>
      <div class="resource-grid">
        <?php foreach (array_slice($posts, 0, 3) as $post): ?>
          <?php
          $slug = isset($post['slug']) && is_string($post['slug']) ? $post['slug'] : '';
          $postUrl = '/resources/' . rawurlencode($slug);
          ?>
          <article class="resource-card">
            <div class="resource-card__meta">
              <span><?= $escape($post['category'] ?? 'Resource') ?></span>
              <?php if (($date = $formatDate($post['published_at'] ?? null)) !== ''): ?><time datetime="<?= $escape($post['published_at'] ?? '') ?>"><?= $escape($date) ?></time><?php endif; ?>
            </div>
            <h3><a href="<?= $escape($postUrl) ?>"><?= $escape($post['title'] ?? 'Untitled resource') ?></a></h3>
            <p><?= $escape($post['excerpt'] ?? '') ?></p>
            <div class="resource-card__footer">By <?= $escape($post['author_name'] ?? 'Dr. Joseph Sperlak') ?></div>
          </article>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </section>

  <section id="faq" class="section faq-grid" aria-labelledby="faq-title">
    <div class="section-heading">
      <span class="eyebrow">VI. Questions</span>
      <h2 id="faq-title" class="section-title">Common questions</h2>
      <p class="section-lede">Don't see yours? <a href="#contact">Ask during your free phone consult.</a></p>
    </div>
    <div class="faq-list">
      <details open><summary>Do I need a doctor's referral?</summary><p>Minnesota allows direct access to physical therapy, so you can typically start without a referral. We'll confirm what applies to you during the phone consult.</p></details>
      <details><summary>Do you take insurance?</summary><p>Forge is a cash-based, out-of-network practice. You pay at the time of service. If your plan offers out-of-network benefits, you can request documentation to submit for possible reimbursement.</p></details>
      <details><summary>What does the $49.99 initial consultation include?</summary><p>An in-person assessment at your home or gym to identify the root cause of your pain or dysfunction, followed by a recommended rehabilitation plan.</p></details>
      <details><summary>Where do sessions take place?</summary><p>At your home, your gym, or on-field, anywhere in the Twin Cities Metro Area. There is no clinic to travel to.</p></details>
      <details><summary>How long is each session?</summary><p>Every session is a full 60 minutes, one-on-one with Dr. Sperlak.</p></details>
      <details><summary>How many visits will I need?</summary><p>It depends on your condition and goals. You'll get a clear plan after your initial consultation, designed for lasting results rather than an open-ended schedule.</p></details>
    </div>
  </section>

  <section id="contact" class="section contact-grid" aria-labelledby="contact-title">
    <div class="contact-copy">
      <span class="eyebrow">VII. Contact</span>
      <h2 id="contact-title">Book a free 15-minute phone consult.</h2>
      <p>Leave your details and Joseph will call you back to talk through your goals and next steps.</p>
      <div class="contact-details">
        <div class="contact-detail"><small>Phone</small><a href="tel:+16125550148">(612) 555-0148</a></div>
        <div class="contact-detail"><small>Email</small><a href="mailto:hello@forgeperformance.com">hello@forgeperformance.com</a></div>
        <div class="contact-detail"><small>Service area</small><span>Twin Cities Metro Area</span></div>
        <div class="contact-detail"><small>Where</small><span>Your home or gym</span></div>
      </div>
    </div>
    <form class="contact-form" action="#contact" method="post">
      <div class="form-row">
        <div class="field"><label for="consult-name">Name</label><input id="consult-name" class="input" name="name" type="text" autocomplete="name" required></div>
        <div class="field"><label for="consult-phone">Phone</label><input id="consult-phone" class="input" name="phone" type="tel" autocomplete="tel" required></div>
      </div>
      <div class="field"><label for="consult-email">Email</label><input id="consult-email" class="input" name="email" type="email" autocomplete="email"></div>
      <div class="field"><label for="consult-time">Best time to call</label><select id="consult-time" class="input" name="best_time"><option>Morning</option><option>Midday</option><option>Afternoon</option><option>Evening</option></select></div>
      <div class="field"><label for="consult-message">What's going on?</label><textarea id="consult-message" class="input" name="message" rows="4"></textarea></div>
      <button class="button button--outline" type="submit">Request my free consult</button>
    </form>
  </section>
</main>
<?php Layout::footer(); ?>
