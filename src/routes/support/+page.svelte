<script lang="ts">
  import { t } from '$lib/i18n';
  import { send } from '$lib/client/api';
  let { data } = $props();
  let provider = $state('');
  let amount = $state<number>(0);
  let busy = $state(false), error = $state('');
  const chosen = $derived(data.providers.find((p) => p.id === provider));
  const currency = $derived(chosen?.currencies[0] || 'NPR');
  const presets = $derived(currency === 'NPR' ? [500, 1000, 2500, 5000] : [5, 10, 25, 50]);
  $effect(() => {
    if (!provider && data.providers.length) provider = data.providers[0].id;
  });
  $effect(() => {
    amount = presets[1];
  });
  async function pay(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const r = await send('payments', { provider, amount, currency });
      if (r.redirect) {
        location.href = r.redirect;
        return;
      }
      if (r.form) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = r.form.action;
        for (const [name, value] of Object.entries(r.form.fields as Record<string, string>)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
        return;
      }
      throw new Error('Payment could not be started.');
    } catch (err) {
      error = (err as Error).message;
      busy = false;
    }
  }
</script>

<svelte:head><title>{$t('Support Yogilib')} · Yogilib</title></svelte:head>
<section class="support">
  <div class="section-heading">
    <div>
      <span class="eyebrow">YOGILIB / {$t('Support')}</span>
      <h1>{$t('Keep the archive open')}</h1>
    </div>
  </div>
  <p class="lede">
    {$t('Yogilib is free to read. Contributions pay for scanning fragile originals, careful transcription, hosting and long-term preservation.')}
  </p>
  {#if !data.providers.length}<p class="card">
      {$t('Online contributions are not open yet.')} <a href="mailto:yogilib108@gmail.com">{$t('Contact us')}</a>
    </p>
  {:else}<form class="card support-form" onsubmit={pay}>
      <fieldset>
        <legend>{$t('Payment method')}</legend>
        {#each ['nepal', 'international'] as region}
          {#if data.providers.some((p) => p.region === region)}<h2>{$t(region === 'nepal' ? 'From Nepal' : 'International')}</h2>{/if}
          {#each data.providers.filter((p) => p.region === region) as p}<label class="radio"
              ><input type="radio" name="provider" value={p.id} bind:group={provider} />{p.label}</label
            >{/each}
        {/each}
      </fieldset>
      <fieldset>
        <legend>{$t('Amount')} ({currency})</legend>
        <div class="choice-row">
          {#each presets as value}<button type="button" class:chosen={amount === value} aria-pressed={amount === value} onclick={() => (amount = value)}
              >{value.toLocaleString()}</button
            >{/each}
        </div>
        <label>{$t('Other amount')}<input type="number" min="1" step="any" bind:value={amount} required /></label>
      </fieldset>
      {#if error}<p class="error" role="alert">{$t(error)}</p>{/if}
      <button class="primary" disabled={busy || !provider}>{busy ? $t('Opening secure payment…') : $t('Contribute')} {amount ? `${currency} ${amount}` : ''}</button>
      <small class="muted">{$t('You will finish on the payment provider’s secure page. Yogilib never sees your card or wallet details.')}</small>
    </form>{/if}
</section>
