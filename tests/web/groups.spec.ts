import { expect, test } from '@playwright/test';
import { account, backend, session, signin } from './account-fixtures';

const ownerId = session().user.id;
const groupId = '00000000-0000-0000-0000-000000000091';
const messageId = '00000000-0000-0000-0000-000000000092';

test('students can discover groups anonymously but creating requires a completed account', async ({ page }) => {
  await backend(page);
  await page.route('**/rest/v1/student_groups?*', async route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse Groups', exact: true }).click();
  await expect(page.getByText('STUORA / GROUPS', { exact: true })).toBeVisible();
  await expect(page.getByText('No student groups found.', { exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('stuora')).toBe('groups');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create a group' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a group' }).click();
  await expect(page.getByText('Welcome to Stuora', { exact: true })).toBeVisible();
});

test('a real saved group is discoverable, editable and discussed through its controlled RPCs', async ({ page }) => {
  await backend(page);
  type Group = { id: string; owner_id: string; name: string; description: string; city: string; topic: string; created_at: string; updated_at: string };
  type Message = { id: string; group_id: string; author_id: string; body: string; created_at: string };
  const groups: Group[] = [];
  const messages: Message[] = [];
  const memberIds = new Set<string>();
  const now = new Date().toISOString();
  let creation = 0;
  let sends = 0;

  await page.route('**/rest/v1/student_groups?*', async route => {
    const request = route.request(), url = new URL(request.url());
    const match = url.searchParams.get('id')?.replace('eq.', '');
    if (request.method() === 'PATCH') {
      expect(url.searchParams.get('owner_id')).toBe('eq.' + ownerId);
      const g = groups.find(x => x.id === match)!;
      Object.assign(g, request.postDataJSON());
      return route.fulfill({ json: { id: g.id }, contentType: 'application/vnd.pgrst.object+json' });
    }
    if (request.method() === 'DELETE') {
      expect(url.searchParams.get('owner_id')).toBe('eq.' + ownerId);
      const i = groups.findIndex(x => x.id === match);
      if (i < 0) return route.fulfill({ status: 404, json: {} });
      const [deleted] = groups.splice(i, 1);
      return route.fulfill({ json: { id: deleted.id }, contentType: 'application/vnd.pgrst.object+json' });
    }
    return route.fulfill({ json: groups });
  });
  await page.route('**/rest/v1/student_group_members?*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'POST') {
      const values = request.postDataJSON();
      expect(values.user_id).toBe(ownerId);
      memberIds.add(values.group_id);
      return route.fulfill({ status: 201, json: {} });
    }
    if (request.method() === 'DELETE') {
      memberIds.delete(url.searchParams.get('group_id')?.replace('eq.', '') || '');
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [...memberIds].map(id => ({ group_id: id })) });
  });
  await page.route('**/rest/v1/rpc/create_student_group', async route => {
    creation++;
    const data = route.request().postDataJSON();
    expect(Object.keys(data).sort()).toEqual(['p_city','p_description','p_name','p_topic']);
    groups.push({ id: groupId, owner_id: ownerId, name: data.p_name, description: data.p_description,
      city: data.p_city, topic: data.p_topic, created_at: now, updated_at: now });
    memberIds.add(groupId);
    return route.fulfill({ json: groupId });
  });
  await page.route('**/rest/v1/rpc/send_student_group_message', async route => {
    sends++;
    const data = route.request().postDataJSON();
    expect(data.p_group_id).toBe(groupId);
    messages.push({ id: messageId, group_id: groupId, author_id: ownerId, body: data.p_body, created_at: now });
    return route.fulfill({ json: messageId });
  });
  await page.route('**/rest/v1/student_group_messages?*', async route => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      messages.splice(0, messages.length);
      return route.fulfill({ status: 204 });
    }
    expect(new URL(request.url()).searchParams.get('group_id')).toBe('eq.' + groupId);
    return route.fulfill({ json: messages });
  });

  await account(page); await signin(page);
  await expect(page.getByLabel('Display name')).toBeVisible();
  await page.getByLabel('Display name').fill('Alice Student');
  await page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await expect(page.getByText('Your profile has been saved.')).toBeVisible();
  await page.goto('/?stuora=groups');
  await expect(page.getByRole('button', { name: 'Create a group' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a group' }).click();
  await page.getByLabel('Group name').fill('Berlin Physics Study Group');
  await page.getByLabel('Group description').fill('Real students preparing for exams');
  await page.getByLabel('Group city').fill('Potsdam');
  await page.getByRole('button', { name: 'Topic University', exact: true }).click();
  await page.getByRole('button', { name: 'Publish group' }).click();
  await expect.poll(() => creation).toBe(1);
  await expect(page.getByText('Berlin Physics Study Group', { exact: true })).toBeVisible();
  await expect(page.getByText('You created this group.', { exact: true })).toBeVisible();
  await page.getByLabel('Message to group').fill('Tuesday at six in the library');
  await page.getByRole('button', { name: 'Send group message' }).click();
  await expect.poll(() => sends).toBe(1);
  const sent = page.getByTestId('student-group-message').getByText('Tuesday at six in the library', { exact: true });
  await sent.scrollIntoViewIfNeeded();
  await expect(sent).toBeVisible();
  await page.getByRole('button', { name: 'Edit group' }).click();
  await page.getByLabel('Group name').fill('Potsdam Physics Circle');
  await page.getByRole('button', { name: 'Save group changes' }).click();
  await expect(page.getByText('Potsdam Physics Circle', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete group', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm delete group' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel group deletion' }).click();
  await expect(page.getByRole('button', { name: 'Confirm delete group' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete group', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete group' }).click();
  await expect(page.getByText('No student groups found.', { exact: true })).toBeVisible();
});
