<template>
  <main class="logo-options-page">
    <header class="logo-options-header">
      <NuxtLink class="logo-options-back" to="/daily-spread">
        <span aria-hidden="true">←</span>
        Back to Daybook
      </NuxtLink>
      <p class="logo-options-kicker">Identity study · 03 — Sun</p>
      <h1>Just the sun.</h1>
      <p class="logo-options-intro">
        Pared all the way down to the sun — same gold disc and delicate rays from option 01, now
        centered as the whole mark. Two versions: a full sun, and a rising sun that keeps only the
        upper rays.
      </p>
    </header>

    <section class="logo-options-grid" aria-label="Daybook sun options">
      <article
        v-for="logo in logos"
        :key="logo.id"
        class="logo-option"
        :class="{ 'logo-option--pick': logo.recommended }"
      >
        <div class="logo-option-stage">
          <img :src="logo.src" :alt="`${logo.name} mark`" width="512" height="512">
        </div>

        <div class="logo-option-copy">
          <div class="logo-option-meta">
            <span>{{ logo.tag }}</span>
            <span v-if="logo.recommended" class="logo-option-motif">Recommended</span>
          </div>
          <h2>{{ logo.name }}</h2>
          <p>{{ logo.description }}</p>

          <div class="logo-option-sizes" aria-label="Scaled previews">
            <img :src="logo.src" :alt="`${logo.name} at 96px`" width="96" height="96">
            <img :src="logo.src" :alt="`${logo.name} at 56px`" width="56" height="56">
            <img :src="logo.src" :alt="`${logo.name} at 32px`" width="32" height="32">
            <span class="logo-option-sizes-note">favicon &amp; app-icon sizes</span>
          </div>
        </div>
      </article>
    </section>

    <p class="logo-options-note">
      Tell me A or B and any tweak — bigger disc, longer or thicker rays, no rays at all — and I’ll
      wire it through the favicon, PWA icon, and in-app mark.
    </p>
  </main>
</template>

<script setup lang="ts">
const logos = [
  {
    id: 'a',
    tag: 'A · Full sun',
    name: 'Full sun',
    recommended: true,
    description:
      'The gold disc centered with a full ring of eight rays. Balanced and complete — the calmest, most symmetric standalone mark.',
    src: '/logo-v5/daybook-sun.svg',
  },
  {
    id: 'b',
    tag: 'B · Rising sun',
    name: 'Rising sun',
    recommended: false,
    description:
      'The exact sun from option 01, centered but keeping only the upper rays — so it still reads as a sunrise, with open space below.',
    src: '/logo-v5/daybook-sun-rising.svg',
  },
] as const;
</script>

<style>
.logo-options-page {
  width: min(100%, 72rem);
  min-height: 100dvh;
  margin-inline: auto;
  padding: 1.35rem 1rem 3rem;
  color: var(--daybook-ink);
}

.logo-options-header {
  max-width: 40rem;
  padding: 0.25rem 0 2.4rem;
}

.logo-options-back {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.75rem;
  color: var(--daybook-ink-muted);
  font-size: 0.86rem;
  text-decoration: none;
}

.logo-options-back:hover { color: var(--daybook-ink); }

.logo-options-kicker {
  margin: 2.2rem 0 0.7rem;
  color: var(--daybook-accent);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.logo-options-header h1 {
  max-width: 24rem;
  margin: 0;
  color: var(--daybook-ink);
  font-size: clamp(2rem, 7vw, 4rem);
  font-weight: 500;
  letter-spacing: -0.055em;
  line-height: 0.98;
}

.logo-options-intro {
  max-width: 34rem;
  margin: 1.2rem 0 0;
  color: var(--daybook-ink-muted);
  font-size: 1rem;
  line-height: 1.65;
}

.logo-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.logo-option {
  overflow: hidden;
  border: 1px solid var(--daybook-line);
  border-radius: 1.15rem;
  background: var(--daybook-surface);
}

.logo-option--pick { border-color: var(--daybook-accent); }

.logo-option-stage {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: clamp(1.6rem, 8vw, 3.6rem);
  background: #111110;
}

.logo-option-stage img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 15rem;
}

.logo-option-copy { padding: 1.1rem 1.15rem 1.3rem; }

.logo-option-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--daybook-ink-faint);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.logo-option-motif { color: var(--daybook-accent); letter-spacing: 0.04em; }

.logo-option h2 {
  margin: 0.5rem 0 0.4rem;
  color: var(--daybook-ink);
  font-size: 1.35rem;
  font-weight: 500;
  letter-spacing: -0.025em;
}

.logo-option p {
  margin: 0;
  color: var(--daybook-ink-muted);
  font-size: 0.92rem;
  line-height: 1.55;
}

.logo-option-sizes {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1.1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--daybook-line);
}

.logo-option-sizes img {
  display: block;
  border-radius: 0.4rem;
  flex: none;
}

.logo-option-sizes-note {
  margin-left: auto;
  color: var(--daybook-ink-faint);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.logo-options-note {
  max-width: 42rem;
  margin: 1.5rem 0 0;
  color: var(--daybook-ink-faint);
  font-size: 0.88rem;
  line-height: 1.55;
}

@media (min-width: 52rem) {
  .logo-options-page { padding: 2.5rem 2rem 4rem; }
  .logo-options-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 68rem) {
  .logo-options-page { padding-inline: 3rem; }
}
</style>
