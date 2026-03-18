// payment helpers (moved)
export async function processPayment(paymentToken: string, amount: number) {
    // integrate with your payment provider
    return { success: true, transactionId: 'tx_sample' };
  }

  export async function reverseGeocode(lat: number, lng: number) {
    // placeholder - integrate with your geocoding provider
    return { address: 'Unknown address' };
  }