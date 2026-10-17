import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import type { PriceDraft } from './project-settings-form.js';
import { NumberSetting, ProviderSetting, TextSetting } from './SettingFields.js';
import type { SectionProps } from './settings-section.js';

// RF-002, DEC-107, data-model.md section 3.1 (`budget.prices`): the price overrides of a project,
// typed in US dollars per million tokens. They replace the shipped price table for calls made with
// the user's own keys.

const perMillion = '(USD per million tokens)';

interface RowProps extends SectionProps {
  readonly index: number;
  readonly price: PriceDraft;
}

function OverrideIdentity({ editor, errorFor, providers, index, price }: RowProps): JSX.Element {
  const label = `Override ${String(index + 1)}`;
  const id = `price-${String(index + 1)}`;
  const path = `budget.prices.${String(index)}`;
  return (
    <>
      <ProviderSetting
        id={`${id}-provider`}
        label={`${label} provider`}
        path={`${path}.provider`}
        errorFor={errorFor}
        options={providers}
        value={price.provider}
        onChange={(provider) => {
          editor.changePrice(index, { provider });
        }}
      />
      <TextSetting
        id={`${id}-model`}
        label={`${label} model`}
        path={`${path}.model`}
        errorFor={errorFor}
        value={price.model}
        onInput={(model) => {
          editor.changePrice(index, { model });
        }}
      />
    </>
  );
}

function OverridePrices({ editor, errorFor, index, price }: RowProps): JSX.Element {
  const label = `Override ${String(index + 1)}`;
  const id = `price-${String(index + 1)}`;
  const path = `budget.prices.${String(index)}`;
  return (
    <>
      <NumberSetting
        id={`${id}-input`}
        label={`${label} input ${perMillion}`}
        path={`${path}.inputPerMillionMicros`}
        errorFor={errorFor}
        value={price.input}
        onInput={(input) => {
          editor.changePrice(index, { input });
        }}
      />
      <NumberSetting
        id={`${id}-output`}
        label={`${label} output ${perMillion}`}
        path={`${path}.outputPerMillionMicros`}
        errorFor={errorFor}
        value={price.output}
        onInput={(output) => {
          editor.changePrice(index, { output });
        }}
      />
      <NumberSetting
        id={`${id}-cached`}
        label={`${label} cached input ${perMillion}`}
        path={`${path}.cachedInputPerMillionMicros`}
        errorFor={errorFor}
        value={price.cached}
        onInput={(cached) => {
          editor.changePrice(index, { cached });
        }}
      />
      <NumberSetting
        id={`${id}-cache-write`}
        label={`${label} cache write ${perMillion}`}
        path={`${path}.cacheWriteInputPerMillionMicros`}
        errorFor={errorFor}
        value={price.cacheWrite}
        onInput={(cacheWrite) => {
          editor.changePrice(index, { cacheWrite });
        }}
      />
    </>
  );
}

/** P2-24: the providers that bill cache writes; their override needs a cache-write price. */
const cacheWriteProviders: readonly string[] = ['anthropic'];

function CacheWriteWarning({ index, price }: Pick<RowProps, 'index' | 'price'>): JSX.Element {
  if (!cacheWriteProviders.includes(price.provider) || price.cacheWrite.trim() !== '') return <></>;
  return (
    <p class="rst-field__help rst-limit__warning" role="status">
      {`Override ${String(index + 1)} has no cache-write price. Anthropic bills cache writes, so a run ignores this override and treats the model as unpriced until you add one.`}
    </p>
  );
}

function OverrideRow(props: SectionProps & { readonly index: number }): JSX.Element {
  const { editor, index } = props;
  const price = editor.draft.prices[index];
  if (price === undefined) return <></>;
  return (
    <li class="rst-price" data-testid="price-override">
      <div class="rst-price__fields">
        <OverrideIdentity {...props} price={price} />
        <OverridePrices {...props} price={price} />
        <CacheWriteWarning index={index} price={price} />
      </div>
      <Button
        variant="danger-outline"
        onClick={() => {
          editor.removePrice(index);
        }}
      >
        {`Remove override ${String(index + 1)}`}
      </Button>
    </li>
  );
}

// RF-002
export function PriceOverrides(props: SectionProps): JSX.Element {
  const { editor } = props;
  const rows = editor.draft.prices;
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="prices">
      <h2 id="prices" class="rst-settings__heading">
        Price overrides
      </h2>
      <p class="rst-settings__note">
        Prices in US dollars per million tokens. They replace the shipped price table, and only for
        calls made with your own keys. An Anthropic model needs its cache-write price; leave it
        empty for other providers.
      </p>
      {rows.length === 0 ? (
        <p class="rst-settings__note">No price overrides. The shipped price table is used.</p>
      ) : (
        <ul class="rst-prices">
          {rows.map((_row, index) => (
            <OverrideRow key={index} {...props} index={index} />
          ))}
        </ul>
      )}
      <div class="rst-key-row__actions">
        <Button onClick={editor.addPrice}>Add price override</Button>
      </div>
    </section>
  );
}
