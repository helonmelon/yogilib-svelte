<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { t } from '$lib/i18n';
  import { send } from '$lib/client/api';
  let { data } = $props();
  let email = $state(''),
    password = $state(''),
    error = $state(''),
    busy = $state(false);
  async function submit(role?: string) {
    busy = true;
    error = '';
    try {
      await send(
        role ? 'demo' : 'login',
        role ? { role } : { email, password },
      );
      password = '';
      await invalidateAll();
      await goto('/');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{$t('Sign in')} · Yogilib</title></svelte:head>
<section class="login-grid">
  <div class="login-intro">
    <span class="eyebrow">YOGILIB / अभिलेखालय</span>
    <h1>ज्ञानको संरक्षण।<br /><em>पुस्तादेखि पुस्तासम्म।</em></h1>
    <p>{$t('Sign in')} · {$t('Archive')}</p>
    <img src="/static/imgs/yogiji.jpeg" alt="Yogi Narharinath" />
  </div>
  <div class="card login-card">
    <h2>{$t('Sign in')}</h2>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label
        >{$t('Email')}<input
          type="email"
          autocomplete="username"
          bind:value={email}
          required
        /></label
      ><label
        >{$t('Password')}<input
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
        /></label
      >{#if error}<p class="error" role="alert">{$t(error)}</p>{/if}<button
        class="primary"
        disabled={busy}>{$t('Sign in')}</button
      >
    </form>
    {#if data.session.demo}<div class="demo-options">
        <small>{$t('Development archive')}</small
        >{#each ['viewer', 'uploader', 'admin'] as role}<button
            disabled={busy}
            onclick={() => submit(role)}
            >{$t(
              role === 'viewer'
                ? 'Explore as reader'
                : role === 'admin'
                  ? 'Explore as admin'
                  : 'Explore as uploader',
            )}</button
          >{/each}
      </div>{/if}<a href="/document/1">Treaty of Sugauli · सुगौली सन्धि</a>
  </div>
</section>
