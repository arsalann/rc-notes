<template>
  <LegalPage title="Privacy Policy" updated="20 October 2026">
    <p>
      Daybook is a personal tasks, notes and journal app. This policy explains what it stores, why,
      and how to delete it. In short: your data is used only to run the app for you. No ads, no
      tracking, no selling or sharing of your data.
    </p>

    <h2>What we store</h2>
    <ul>
      <li><strong>Your account:</strong> your username and a one-way hash of your password (we never store the password itself).</li>
      <li><strong>Your content:</strong> the tasks, notes, journal pages, goals, workspaces, tags and templates you create.</li>
      <li><strong>Technical records:</strong> for each request to the server we keep a log entry with the time, the address it came from (IP), the app or browser version, a random device id the app creates, and what was changed. Passwords are never logged. This lets us keep sync working, protect accounts and recover data after a fault.</li>
    </ul>
    <p>We do not collect your name, email address, contacts, location, photos, health data or advertising identifiers.</p>

    <h2>How we use it</h2>
    <p>
      Only to provide the app: to show and sync your data across your devices, to keep your account
      secure, and to fix problems. Your data is private to your account; other users cannot see it.
      We do not use it for advertising or analytics, and we do not track you across other apps or websites.
    </p>

    <h2>Where it is stored</h2>
    <p>
      Data is stored in a Postgres database hosted by Supabase in the EU (Ireland) and served by an
      app server hosted by Railway. They process data only on our behalf. The iOS app also keeps a
      copy of your data on your device so it works offline. Connections are encrypted (HTTPS/TLS).
    </p>

    <h2>Keeping and deleting your data</h2>
    <p>
      We keep your data while you have an account. You can delete your account at any time in the app
      (<em>Settings → Delete account</em>, on the web and on iPhone). This permanently deletes your
      account, all of your content and the request records linked to it. Copies in encrypted database
      backups expire within 30 days.
    </p>

    <h2>Children</h2>
    <p>Daybook is not directed at children under 13.</p>

    <h2>Changes and contact</h2>
    <p>
      If this policy changes, the date above changes with it. Questions or requests:
      <a v-if="contact" :href="`mailto:${contact}`">{{ contact }}</a><span v-else>see the support page</span>.
    </p>
  </LegalPage>
</template>

<script setup lang="ts">
const contact = useRuntimeConfig().public.contactEmail as string;
</script>
