import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Localized, withLocalization } from '@fluent/react';
import {
  Stripe,
  StripeElements,
  StripeCardElement,
  StripeElementsOptions,
} from '@stripe/stripe-js';
import {
  CardElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  Form,
  Input,
  StripeElement,
  SubmitButton,
  Checkbox,
  OnValidateFunction,
} from '../fields';
import PaymentLegalBlurb from '../PaymentLegalBlurb';
import {
  State as ValidatorState,
  MiddlewareReducer as ValidatorMiddlewareReducer,
  useValidatorState,
} from '../../lib/validator';
import { useCallbackOnce } from '../../lib/hooks';
import {
  getLocalizedCurrency,
  getDefaultPaymentConfirmText,
} from '../../lib/formats';
import { AppContext } from '../../lib/AppContext';
import { Plan } from '../../store/types';
import { productDetailsFromPlan } from 'fxa-shared/subscriptions/metadata';

import './index.scss';
import { TermsAndPrivacy } from '../TermsAndPrivacy';

export type BasePaymentFormProps = {
  inProgress?: boolean;
  confirm?: boolean;
  plan?: Plan;
  getString?: Function;
  onCancel?: () => void;
  onSubmit: (submitResult: {
    stripe: Stripe;
    elements: StripeElements;
    name: string;
    card: StripeCardElement;
    idempotencyKey: string;
  }) => void;
  validatorInitialState?: ValidatorState;
  validatorMiddlewareReducer?: ValidatorMiddlewareReducer;
  onMounted: Function;
  onEngaged: Function;
  onChange: Function;
  submitNonce: string;
};

export const PaymentForm = ({
  inProgress = false,
  confirm = true,
  plan,
  getString,
  onSubmit: onSubmitForParent,
  onCancel,
  validatorInitialState,
  validatorMiddlewareReducer,
  onMounted,
  onEngaged,
  onChange: onChangeProp,
  submitNonce,
}: BasePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();

  const validator = useValidatorState({
    initialState: validatorInitialState,
    middleware: validatorMiddlewareReducer,
  });

  useEffect(() => {
    onMounted(plan);
  }, [onMounted, plan]);

  const engageOnce = useCallbackOnce(() => {
    onEngaged(plan);
  }, [onEngaged, plan]);

  const onChange = useCallback(() => {
    engageOnce();
    onChangeProp();
  }, [engageOnce, onChangeProp]);

  const [lastSubmitNonce, setLastSubmitNonce] = useState('');
  const nonceMatch = submitNonce === lastSubmitNonce;
  const shouldAllowSubmit = !nonceMatch && !inProgress && validator.allValid();
  const showProgressSpinner = nonceMatch || inProgress;

  const onSubmit = useCallback(
    async (ev) => {
      ev.preventDefault();
      if (!stripe || !elements || !shouldAllowSubmit) {
        return;
      }
      setLastSubmitNonce(submitNonce);
      const { name } = validator.getValues();
      const card = elements.getElement(CardElement);
      /* istanbul ignore next - card should exist unless there was an external stripe loading error, handled above */
      if (card) {
        onSubmitForParent({
          stripe,
          elements,
          name,
          card,
          idempotencyKey: submitNonce,
        });
      }
    },
    [validator, onSubmitForParent, stripe, submitNonce, shouldAllowSubmit]
  );

  const { matchMedia, navigatorLanguages } = useContext(AppContext);
  const stripeElementStyles = mkStripeElementStyles(
    matchMedia(SMALL_DEVICE_RULE)
  );

  let termsOfServiceURL, privacyNoticeURL;
  if (confirm && plan) {
    ({ termsOfServiceURL, privacyNoticeURL } = productDetailsFromPlan(
      plan,
      navigatorLanguages
    ));
  }

  return (
    <Form
      data-testid="paymentForm"
      validator={validator}
      onSubmit={onSubmit}
      className="payment"
      {...{ onChange }}
    >
      <Localized id="payment-name" attrs={{ placeholder: true, label: true }}>
        <Input
          type="text"
          name="name"
          label="Name as it appears on your card"
          data-testid="name"
          placeholder="Full Name"
          required
          autoFocus
          spellCheck={false}
          onValidate={(value, focused, props) =>
            validateName(value, focused, props, getString)
          }
        />
      </Localized>

      <Localized id="payment-cc" attrs={{ label: true }}>
        <StripeElement
          component={CardElement}
          name="creditCard"
          label="Your card"
          style={stripeElementStyles}
          className="input-row input-row--xl"
          getString={getString}
          required
        />
      </Localized>

      <hr />

      {confirm && plan && (
        <>
          <Localized
            id={`payment-confirm-with-legal-links-${plan.interval}`}
            $intervalCount={plan.interval_count}
            $amount={getLocalizedCurrency(plan.amount, plan.currency)}
            strong={<strong></strong>}
            termsOfServiceLink={<a href={termsOfServiceURL}></a>}
            privacyNoticeLink={<a href={privacyNoticeURL}></a>}
          >
            <Checkbox data-testid="confirm" name="confirm" required>
              {getDefaultPaymentConfirmText(
                plan.amount,
                plan.currency,
                plan.interval,
                plan.interval_count
              )}
            </Checkbox>
          </Localized>
          <hr />
        </>
      )}

      {onCancel ? (
        <div className="button-row">
          <Localized id="payment-cancel-btn">
            <button
              data-testid="cancel"
              className="settings-button cancel secondary-button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </Localized>

          <Localized id="payment-update-btn">
            <SubmitButton
              data-testid="submit"
              className="settings-button primary-button"
              name="submit"
              disabled={inProgress}
            >
              {inProgress ? (
                <span data-testid="spinner-update" className="spinner">
                  &nbsp;
                </span>
              ) : (
                <span>Update</span>
              )}
            </SubmitButton>
          </Localized>
        </div>
      ) : (
        <div className="button-row">
          <Localized id="payment-submit-btn">
            <SubmitButton
              data-testid="submit"
              name="submit"
              disabled={!shouldAllowSubmit}
            >
              {showProgressSpinner ? (
                <span data-testid="spinner-submit" className="spinner">
                  &nbsp;
                </span>
              ) : (
                <Localized id="payment-pay-btn">
                  <span className="lock">Pay now</span>
                </Localized>
              )}
            </SubmitButton>
          </Localized>
        </div>
      )}

      <PaymentLegalBlurb />
      {plan && <TermsAndPrivacy plan={plan} />}
    </Form>
  );
};

/* istanbul ignore next - skip testing react-stripe-elements plumbing */
export type PaymentFormProps = {
  locale?: string;
} & BasePaymentFormProps;
const WrappedPaymentForm = (props: PaymentFormProps) => {
  const { locale, ...otherProps } = props;
  const { stripePromise } = useContext(AppContext);
  return (
    <Elements
      options={{ locale: localeToStripeLocale(locale) }}
      stripe={stripePromise}
    >
      <PaymentForm {...otherProps} />
    </Elements>
  );
};

export const SMALL_DEVICE_RULE = '(max-width: 520px)';
export const SMALL_DEVICE_LINE_HEIGHT = '40px';
export const DEFAULT_LINE_HEIGHT = '48px';

export function mkStripeElementStyles(useSmallDeviceStyles: boolean) {
  // ref: https://stripe.com/docs/stripe-js/reference#the-elements-object
  return {
    base: {
      //TODO: Figure out what this really should be - I just copied it from computed styles because CSS can't apply through the iframe
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
      fontSize: '14px',
      fontWeight: '500',
    },
    invalid: {
      color: '#0c0c0d',
    },
  };
}

const validateName: OnValidateFunction = (
  value,
  focused,
  _props,
  getString
) => {
  let valid = true;
  if (value !== null && !value) {
    valid = false;
  }
  const errorMsg = getString
    ? /* istanbul ignore next - not testing l10n here */
      getString('payment-validate-name-error')
    : 'Please enter your name';
  return {
    value,
    valid,
    error: !valid && !focused ? errorMsg : null,
  };
};

/**
 * Stripe locales do not exactly match FxA locales. Mostly language tags
 * without subtags. This function should convert / normalize as necessary.
 */
type StripeLocale = StripeElementsOptions['locale'];
export const localeToStripeLocale = (locale?: string): StripeLocale => {
  if (locale) {
    if (locale in stripeLocales) {
      return locale as StripeLocale;
    }
    const lang = locale.split('-').shift();
    if (lang && lang in stripeLocales) {
      return lang as StripeLocale;
    }
  }
  return 'auto';
};

// TODO: Move to fxa-shared/l10n?
// see also: https://stripe.com/docs/js/appendix/supported_locales
enum stripeLocales {
  'ar',
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'et',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hu',
  'id',
  'it',
  'ja',
  'lt',
  'lv',
  'ms',
  'mt',
  'nb',
  'nl',
  'pl',
  'pt-BR',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sv',
  'tk',
  'zh',
}

export default withLocalization(WrappedPaymentForm);
