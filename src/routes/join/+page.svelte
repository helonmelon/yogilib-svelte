<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { t } from '$lib/i18n';
  import { send } from '$lib/client/api';
  let email = $state(''), name = $state(''), password = $state(''), error = $state(''), busy = $state(false);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await send('register', { email, password, display_name: name });
      password = '';
      await invalidateAll();
      await goto('/welcome');
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{$t('Join Yogilib')} · Yogilib</title></svelte:head>
<section class="login-grid">
  <div class="card login-card">
    <span class="eyebrow">{$t('Step 1 of 2')}</span>
    <h2>{$t('Join Yogilib')}</h2>
    <p class="muted">{$t('A free reader account. Reading stays open to everyone; your notes stay private.')}</p>
    <form onsubmit={submit}>
      <label>{$t('Your name')}<input autocomplete="name" bind:value={name} maxlength="80" /></label>
      <label>{$t('Email')}<input type="email" autocomplete="email" bind:value={email} required /></label>
      <label
        >{$t('Password')}<input
          type="password"
          autocomplete="new-password"
          minlength="10"
          bind:value={password}
          required
        /><small class="muted">{$t('At least 10 characters.')}</small></label
      >
      {#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
      <button class="primary" disabled={busy}>{busy ? $t('Creating account…') : $t('Create account')}</button>
    </form>
    <a class="back-login" href="/contributor-login">{$t('Already have an account? Sign in')}</a>
  </div>
</section>
