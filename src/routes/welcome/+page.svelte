<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { t, locale } from '$lib/i18n';
  import { send } from '$lib/client/api';
  import { categories } from '$lib/types';
  let { data } = $props();
  const user = $derived(data.session.user);
  let step = $state(0);
  let lang = $state<'en' | 'ne'>('en');
  let picked = $state<string[]>([]);
  let busy = $state(false), error = $state('');
  const topics = categories.filter((c) => c !== 'सबै');
  function chooseLanguage(value: 'en' | 'ne') {
    lang = value;
    locale.set(value);
    document.documentElement.lang = value;
    document.cookie = `yogilib-language=${value};path=/;max-age=31536000;SameSite=Lax`;
    try {
      localStorage.setItem('yogilib-language', value);
    } catch {}
  }
  function toggle(topic: string) {
    picked = picked.includes(topic) ? picked.filter((x) => x !== topic) : [...picked, topic];
  }
  async function finish() {
    busy = true;
    error = '';
    try {
      await send('onboarding', { preferred_lang: lang, interests: picked });
      await invalidateAll();
      await goto(picked.length === 1 ? `/?cat=${encodeURIComponent(picked[0])}` : '/');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{$t('Welcome')} · Yogilib</title></svelte:head>
<section class="welcome card">
  <ol class="steps" aria-label={$t('Setup progress')}>
    {#each [$t('Language'), $t('Interests'), $t('Start reading')] as label, i}<li
        class:done={i < step}
        class:current={i === step}
      >
        {label}
      </li>{/each}
  </ol>
  {#if step === 0}
    <h1>{$t('Welcome')}{user?.display_name ? `, ${user.display_name}` : ''}</h1>
    <p>{$t('Choose the language for menus and buttons. Archive texts always stay in their original language and script.')}</p>
    <div class="choice-row">
      <button class:chosen={lang === 'en'} aria-pressed={lang === 'en'} onclick={() => chooseLanguage('en')}>English</button>
      <button class:chosen={lang === 'ne'} aria-pressed={lang === 'ne'} onclick={() => chooseLanguage('ne')}>नेपाली</button>
    </div>
    <button class="primary" onclick={() => (step = 1)}>{$t('Continue')}</button>
  {:else if step === 1}
    <h1>{$t('What would you like to read?')}</h1>
    <p>{$t('Pick any that interest you. You can explore everything either way.')}</p>
    <div class="choice-row">
      {#each topics as topic}<button class:chosen={picked.includes(topic)} aria-pressed={picked.includes(topic)} onclick={() => toggle(topic)}
          >{$t(topic)}</button
        >{/each}
    </div>
    <div class="choice-row">
      <button class="quiet" onclick={() => (step = 0)}>{$t('Back')}</button>
      <button class="primary" onclick={() => (step = 2)}>{$t('Continue')}</button>
    </div>
  {:else}
    <h1>{$t('You are ready')}</h1>
    <ul class="tour">
      <li><strong>{$t('Search')}</strong> — {$t('titles and full text, in Nepali or English.')}</li>
      <li><strong>{$t('Private notes')}</strong> — {$t('select a passage while reading to highlight it or add a note.')}</li>
      <li><strong>{$t('Reading companion')}</strong> — {$t('ask AI to summarise a document or explain a passage, where available.')}</li>
      <li><strong>{$t('Sync')}</strong> — {$t('your place in each document follows you across devices.')}</li>
    </ul>
    {#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
    <div class="choice-row">
      <button class="quiet" onclick={() => (step = 1)}>{$t('Back')}</button>
      <button class="primary" disabled={busy} onclick={finish}>{$t('Open the archive')}</button>
    </div>
  {/if}
</section>
