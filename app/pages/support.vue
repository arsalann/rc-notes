<template>
  <LegalPage title="Support">
    <p>Need help with Daybook, found a bug, or want your data exported? Get in touch:</p>
    <p v-if="contact"><a :href="`mailto:${contact}`">{{ contact }}</a></p>
    <h2>Deleting your account</h2>
    <p>
      Open <em>Settings</em> and choose <em>Delete account</em> (web or iPhone). You will be asked for
      your password; your account and all of its data are then deleted permanently.
    </p>
    <h2>Privacy</h2>
    <p>See the <NuxtLink to="/privacy">privacy policy</NuxtLink>.</p>
  </LegalPage>
</template>

<script setup lang="ts">
const contact = useRuntimeConfig().public.contactEmail as string;
</script>
