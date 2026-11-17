<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { t } from '$lib/i18n';
  import { send } from '$lib/client/api';
  let { data } = $props();
  let email = $state(''), password = $state(''), error = $state(''), busy = $state(false);
  async function submit(role?: string) {
    busy = true; error = '';
    try {
      await send(role ? 'demo' : 'login', role ? { role } : { email, password });
      password = '';
      await invalidateAll();
      await goto(new URLSearchParams(location.search).get('next')?.startsWith('/') ? new URLSearchParams(location.search).get('next')! : '/');
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
</script>

<svelte:head><title>{$t('Sign in with email')} · Yogilib</title></svelte:head>
<section class="login-grid">
  <div class="card login-card">
    <h2>{$t('Sign in with email')}</h2>
    <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <label>{$t('Email')}<input type="email" autocomplete="username" bind:value={email} required /></label>
      <label>{$t('Password')}<input type="password" autocomplete="current-password" bind:value={password} required /></label>
      {#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
      <button class="primary" disabled={busy}>{$t('Sign in')}</button>
    </form>
    {#if data.session.demo}<div class="demo-options">
      <small>{$t('Development archive')}</small>
      {#each ['viewer', 'uploader', 'admin'] as role}
        <button disabled={busy} onclick={() => submit(role)}>{$t(role === 'viewer' ? 'Explore as reader' : role === 'admin' ? 'Explore as admin' : 'Explore as uploader')}</button>
      {/each}
    </div>{/if}
    <a class="back-login" href="/join">{$t('New here? Create a free reader account')}</a>
  </div>
</section>
