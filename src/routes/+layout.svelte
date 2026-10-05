<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto, invalidateAll, beforeNavigate } from '$app/navigation';
  import { locale, t, dirty } from '$lib/i18n';
  import { send } from '$lib/client/api';
  import { clearPrivate, pendingFor, sync } from '$lib/client/offline';
  let { data, children } = $props();
  let notice = $state('');
  let online = $state(true);
  let pending = $state(0);
  const user = $derived(data.session?.user);
  const demo = $derived(data.session?.demo);
  async function syncNow() {
    if (!user || !online) return;
    try {
      const conflicts = await sync(user.id);
      notice = conflicts.length ? 'Reading position conflict' : '';
      pending = (await pendingFor(user.id)).length;
    } catch (e) {
      notice = (e as Error).message;
    }
  }
  function language(value: string) {
    if ($dirty && !confirm('Unsaved changes will be lost. Change language?'))
      return;
    locale.set(value === 'ne' ? 'ne' : 'en');
    document.documentElement.lang = value;
    document.cookie = `yogilib-language=${value};path=/;max-age=31536000;SameSite=Lax`;
    localStorage.setItem('yogilib-language', value);
  }
  async function logout() {
    try {
      if (
        user &&
        (await pendingFor(user.id)).length &&
        !confirm('Discard unsynced private changes and sign out?')
      )
        return;
      await send('logout', {});
      if (user) await clearPrivate(user.id);
      localStorage.removeItem('yogilib-identity');
      await invalidateAll();
      await goto('/login');
    } catch (e) {
      notice = (e as Error).message;
    }
  }
  beforeNavigate(({ cancel }) => {
    if ($dirty && !confirm('You have unsaved changes. Leave this page?'))
      cancel();
  });
  onMount(() => {
    locale.set(
      localStorage.getItem('yogilib-language') === 'ne' ||
        document.cookie.includes('yogilib-language=ne')
        ? 'ne'
        : 'en',
    );
    online = navigator.onLine;
    const update = () => {
      online = navigator.onLine;
      if (online) syncNow();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const unload = (e: BeforeUnloadEvent) => {
      if ($dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    if (
      'serviceWorker' in navigator &&
      import.meta.env.PROD &&
      import.meta.env.VITE_MOBILE !== '1'
    )
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    syncNow();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeunload', unload);
    };
  });
</script>

<svelte:head
  ><title>Yogilib</title><meta
    name="description"
    content="An archive of Yogi Narharinath's works and Nepal's historical material."
  /></svelte:head
>
<a class="skip" href="#main">Skip to content</a>
{#if demo}<div class="demo-strip">
    <strong>{$t('Development archive')}</strong><span
      >{$t('Sample data only. Your shared archive is not connected.')}</span
    >
  </div>{/if}
<header class="masthead">
  <a class="brand" href="/"
    ><img
      src="/static/imgs/yogipp.jpeg"
      alt="Yogi Narharinath"
      width="42"
      height="42"
    /><span>Yogilib<small>योगी नरहरिनाथ</small></span></a
  >
  <div class="mast-actions">
    <label class="sr-only" for="language">Interface language</label><select
      id="language"
      value={$locale}
      onchange={(e) => language(e.currentTarget.value)}
      ><option value="en">English</option><option value="ne">नेपाली</option
      ></select
    >{#if user}<button class="quiet" onclick={logout}>{$t('Logout')}</button
      >{:else}<a class="button" href="/login">{$t('Login')}</a>{/if}
  </div>
</header>
<nav class="navigation" aria-label="Main">
  <a class:active={$page.url.pathname === '/'} href="/">{$t('Archive')}</a
  >{#if user?.role === 'admin' || user?.role === 'uploader'}<a href="/upload"
      >{$t('Upload')}</a
    >{/if}{#if user?.role === 'admin'}<a href="/dashboard">{$t('Dashboard')}</a
    >{/if}<span class="nav-status"
    >{#if !online}{$t('Offline')}{:else if user}<button
        class="quiet"
        onclick={syncNow}
        >{$t('Sync now')}{pending ? ` (${pending})` : ''}</button
      >{/if}</span
  >
</nav>
{#if notice}<div class="notice" role="status">
    {$t(notice)}
    <button class="quiet" onclick={() => (notice = '')}>{$t('Close')}</button>
  </div>{/if}
<main id="main">{@render children()}</main>
<footer>
  <span>Yogilib — योगी नरहरिनाथको स्मृतिमा (१९७१–२०५९)</span>
  <nav><a href="mailto:yogilib108@gmail.com">Contact</a></nav>
</footer>
