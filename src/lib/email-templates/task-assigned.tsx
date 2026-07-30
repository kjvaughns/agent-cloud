import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  title?: string
  dueDate?: string
  assignedBy?: string
  appUrl?: string
}

const TaskAssigned = ({ brand, title, dueDate, assignedBy, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`New task: ${title || 'You have a new task'}`}
    heading="A task was assigned to you"
    lead={title || 'You have a new task in Agent Cloud.'}
    cta={{ label: 'Open your tasks', href: `${appUrl || 'https://useagentcloud.com'}/tasks` }}
  >
    <DetailRow label="Task" value={title || '—'} />
    {dueDate ? <DetailRow label="Due" value={dueDate} /> : null}
    {assignedBy ? <DetailRow label="Assigned by" value={assignedBy} /> : null}
    <Paragraph>Mark it done in the app and it clears from everyone's view.</Paragraph>
  </EmailLayout>
)

export const template = {
  component: TaskAssigned,
  subject: (d: Record<string, any>) => `New task: ${d?.title || 'assigned to you'}`,
  displayName: 'Task assigned',
  previewData: { title: 'Call the Hollis family about the lapse notice', dueDate: 'Tomorrow', assignedBy: 'Kaeden Vaughns' },
} satisfies TemplateEntry

export default TaskAssigned
