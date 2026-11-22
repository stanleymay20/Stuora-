export async function selectAndSubmitGroupPdf(
  _groupId: string, _token: string, _url: string, _publishableKey: string,
): Promise<'cancelled'|'pending_review'> {
  throw new Error('PDF upload from the browser is not enabled yet.');
}
