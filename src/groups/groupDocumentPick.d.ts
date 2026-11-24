export function selectAndSubmitGroupPdf(
  groupId:string,token:string,url:string,publishableKey:string,
):Promise<'cancelled'|'pending_review'>;
