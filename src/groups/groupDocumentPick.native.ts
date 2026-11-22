import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { groupUploadRequest, MAX_FILE_BYTES } from './groupFileTransfer';

/** Native file selection. PDFs always remain pending until a real scanner clears them. */
export async function selectAndSubmitGroupPdf(
  groupId: string, token: string, url: string, publishableKey: string,
): Promise<'cancelled'|'pending_review'> {
  const selected=await File.pickFileAsync({mimeTypes:['application/pdf'],multipleFiles:false});
  if(selected.canceled || !selected.result)return 'cancelled';
  const file=selected.result;
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size <= 0 || file.size > MAX_FILE_BYTES)
    throw new Error('Choose a PDF of 5 MB or less.');
  const request=groupUploadRequest(groupId,token,url,publishableKey);
  const body=new FormData();
  body.append('groupId',groupId);
  body.append('file',file,file.name);
  const res=await expoFetch(request.url,{method:'POST',headers:request.headers,body});
  if (!res.ok)throw new Error('PDF upload is not available. Please try later.');
  const payload:unknown=await res.json();
  if(!payload || typeof payload!=='object' || !('file' in payload) ||
    !payload.file || typeof payload.file!=='object' ||
    !('status' in payload.file) || payload.file.status!=='pending_review')
    throw new Error('PDF upload verification failed.');
  return 'pending_review';
}
