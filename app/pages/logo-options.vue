<template>
  <main class="logo-options-page">
    <header class="logo-options-header">
      <NuxtLink class="logo-options-back" to="/daily-spread">
        <span aria-hidden="true">←</span>
        Back to Daybook
      </NuxtLink>
      <p class="logo-options-kicker">Identity study · 02</p>
      <h1>Five geometric marks for Daybook.</h1>
      <p class="logo-options-intro">
        This round keeps the pen, book, and sun, but builds them from a restrained motif system:
        clean cuts, strong negative space, and one warm focal accent.
      </p>
    </header>

    <section class="logo-options-grid" aria-label="Daybook logo options">
      <article v-for="logo in logos" :key="logo.id" class="logo-option">
        <div class="logo-option-stage">
          <img :src="logo.src" :alt="`${logo.name} logo option`" width="640" height="640">
        </div>
        <div class="logo-option-copy">
          <div class="logo-option-meta">
            <span>0{{ logo.id }}</span>
            <span v-if="logo.active" class="logo-option-active">Current favicon</span>
          </div>
          <h2>{{ logo.name }}</h2>
          <p>{{ logo.description }}</p>
        </div>
      </article>
    </section>

    <p class="logo-options-note">
      Option 05 is now the active favicon and app icon. The other directions remain here as visual
      alternatives if you want to explore the motif further.
    </p>
  </main>
</template>

<script setup lang="ts">
const logos = [
  {
    id: 1,
    name: 'Open / pen',
    description: 'The clearest journal read: two page planes, a centered pen nib, and a quiet sun above.',
    src: '/logo-options-v4/daybook-logo-geometric-2d-option-1-open-pen.png',
    active: false,
  },
  {
    id: 2,
    name: 'Modular note',
    description: 'A more graphic direction with floating blocks that make the journal feel like a designed system.',
    src: '/logo-options-v4/daybook-logo-geometric-2d-option-2-modular.png',
    active: false,
  },
  {
    id: 3,
    name: 'Horizon',
    description: 'The calmest option: an open book becomes a line, with the sun held above the fold.',
    src: '/logo-options-v4/daybook-logo-geometric-2d-option-3-horizon.png',
    active: false,
  },
  {
    id: 4,
    name: 'Folded sun',
    description: 'A compact badge-free mark where the pen sits inside the fold and the sun rises behind it.',
    src: '/logo-options-v4/daybook-logo-geometric-2d-option-4-fold.png',
    active: false,
  },
  {
    id: 5,
    name: 'Selected motif',
    description: 'The chosen flat version of the geometric pen, book, and sun emblem from the latest reference.',
    src: '/logo-options-v4/daybook-logo-geometric-2d-option-5-selected.png',
    active: true,
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
  max-width: 38rem;
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

.logo-option-stage {
  aspect-ratio: 1;
  padding: clamp(1.4rem, 7vw, 3.2rem);
  background: #171716;
}

.logo-option-stage img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0.45rem;
}

.logo-option-copy { padding: 1rem 1.1rem 1.2rem; }

.logo-option-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--daybook-ink-faint);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.logo-option-active { color: var(--daybook-accent); letter-spacing: 0.04em; }

.logo-option h2 {
  margin: 0.5rem 0 0.35rem;
  color: var(--daybook-ink);
  font-size: 1.35rem;
  font-weight: 500;
  letter-spacing: -0.025em;
}

.logo-option p {
  margin: 0;
  color: var(--daybook-ink-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.logo-options-note {
  max-width: 42rem;
  margin: 1.5rem 0 0;
  color: var(--daybook-ink-faint);
  font-size: 0.88rem;
  line-height: 1.55;
}

@media (min-width: 42rem) {
  .logo-options-page { padding: 2.5rem 2rem 4rem; }
  .logo-options-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .logo-option:first-child { grid-column: span 2; display: grid; grid-template-columns: minmax(16rem, 0.85fr) 1fr; align-items: stretch; }
  .logo-option:first-child .logo-option-stage { aspect-ratio: auto; min-height: 22rem; }
  .logo-option:first-child .logo-option-copy { display: flex; flex-direction: column; justify-content: center; padding: 2rem; }
}

@media (min-width: 68rem) {
  .logo-options-page { padding-inline: 3rem; }
  .logo-options-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .logo-option:first-child { grid-column: span 2; }
}
</style>
