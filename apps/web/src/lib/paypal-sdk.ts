/**
 * Minimal loader for PayPal's JS SDK hosted card fields. Card number, expiry and
 * CVV are typed into PayPal iframes, so card data never touches our page or API.
 */

interface PayPalField {
  render: (selector: string | HTMLElement) => Promise<void>;
}

export interface PayPalCardFields {
  isEligible: () => boolean;
  NameField: (opts?: { placeholder?: string }) => PayPalField;
  NumberField: (opts?: { placeholder?: string }) => PayPalField;
  ExpiryField: (opts?: { placeholder?: string }) => PayPalField;
  CVVField: (opts?: { placeholder?: string }) => PayPalField;
  submit: () => Promise<void>;
}

export interface PayPalNamespace {
  CardFields: (opts: {
    createVaultSetupToken: () => Promise<string>;
    onApprove: (data: { vaultSetupToken: string }) => void | Promise<void>;
    onError: (error: unknown) => void;
    style?: Record<string, Record<string, string>>;
  }) => PayPalCardFields;
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let loading: Promise<PayPalNamespace> | null = null;

export function loadPayPalSdk(clientId: string): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (loading) return loading;
  loading = new Promise<PayPalNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=card-fields`;
    script.async = true;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PayPal did not load')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not reach PayPal — check your connection and try again'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Field styling inside PayPal's iframes, matched to the dashboard's dark inputs. */
export const CARD_FIELD_STYLE = {
  input: {
    'font-size': '14px',
    'font-family': 'system-ui, sans-serif',
    color: '#e6ebf2',
    background: '#0b0f15',
    padding: '10px 12px',
  },
  '.invalid': { color: '#ff6b6b' },
};
