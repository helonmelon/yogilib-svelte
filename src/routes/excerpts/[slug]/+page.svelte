<script lang="ts">
  import { t } from '$lib/i18n';
  let { data } = $props();
</script>

<section class="prose">
  <h1>Treaty of Sugowlee, Dec. 2, 1815</h1>
  <a href="/excerpts">{$t('← All Excerpts')}</a>{@html data.body}
</section>
