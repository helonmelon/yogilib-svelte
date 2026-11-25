<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  let { signedIn = false } = $props();
  const KEY = 'yogilib-welcomed';
  let show = $state(false);
  onMount(() => {
    try {
      show = localStorage.getItem(KEY) !== '1';
    } catch {
      show = false;
    }
  });
  function dismiss() {
    show = false;
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  }
</script>

{#if show}
  <aside class="welcome" aria-labelledby="welcome-title">
    <div>
      <span class="eyebrow">YOGILIB · स्वागतम्</span>
      <h2 id="welcome-title">{$t('Welcome to Yogilib')}</h2>
      <p>
        {$t('A living archive of original texts, kept as they were written.')}
      </p>
      <ol>
        <li>
          {$t('Search titles and passages in Devanagari or Roman script.')}
        </li>
        <li>
          {$t(
            'Open any work to read; adjust font size and spacing in the reading tools.',
          )}
        </li>
        {#if !signedIn}<li>
            <a href="/login"
              >{$t(
                'Sign in to keep private notes and resume where you left off.',
              )}</a
            >
          </li>{/if}
      </ol>
    </div>
    <button class="primary" onclick={dismiss}>{$t('Start reading')}</button>
  </aside>
{/if}

<style>
  .welcome {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    margin: 0 0 1rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    background: var(--cream);
  }
  h2 {
    margin: 0.15rem 0 0.25rem;
    font-size: 1.15rem;
  }
  p,
  ol {
    margin: 0.2rem 0;
  }
  ol {
    padding-left: 1.2rem;
    font-size: 0.92rem;
  }
</style>
