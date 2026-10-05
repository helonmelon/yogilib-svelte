<script>
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
</script>

<section class="prose">
  <span class="eyebrow">YOGILIB / {$page.status}</span>
  <h1>{$page.error?.message || 'Something went wrong'}</h1>
  <a class="button" href="/">{$t('Back to archive')}</a><a
    class="button"
    href="/downloads">{$t('Downloads')}</a
  >
</section>
