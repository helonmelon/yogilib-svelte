<script lang="ts">
  import { t } from '$lib/i18n';
</script>

<svelte:head><title>{$t('Sign in')} · Yogilib</title></svelte:head>
<section class="login-grid">
  <div class="card login-card">
    <h2>{$t('Sign in to Yogilib')}</h2>
    <p class="muted">
      {$t('Reading the archive is free and open. An account adds private notes, synced reading positions and the AI reading companion.')}
    </p>
    <a class="button primary join-cta" href="/join">{$t('Create a free reader account')}</a>
    <div class="login-divider"><span>{$t('or')}</span></div>
    <a class="contributor-login" href="/contributor-login">{$t('Sign in with email')}</a>
    <button class="google-login" disabled title={$t('Coming soon')}>{$t('Continue with Google')} · {$t('Coming soon')}</button>
  </div>
</section>
