import type { IconName } from '@/components/dash/icons';
import type { Role } from './api-types';

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: IconName;
  badgeKey?: 'pendingPayments' | 'pendingApprovals' | 'unreadChats' | 'unreadTickets';
  staticBadge?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const SETTINGS: NavItem = { href: '/settings', label: 'Settings', icon: 'gear' };

export function navFor(role: Role): NavGroup[] {
  if (role === 'client') {
    return [
      {
        items: [
          { href: '/', label: 'Overview', icon: 'grid' },
          { href: '/submit', label: 'Submit URLs', short: 'Submit', icon: 'upload' },
          { href: '/urls', label: 'All URLs', short: 'URLs', icon: 'list' },
          { href: '/sites', label: 'Sites', icon: 'globe' },
        ],
      },
      {
        label: 'Support',
        items: [
          { href: '/tickets', label: 'Tickets', icon: 'ticket', badgeKey: 'unreadTickets' },
          { href: '/chat', label: 'Live chat', short: 'Chat', icon: 'chat', badgeKey: 'unreadChats' },
        ],
      },
      {
        label: 'Account',
        items: [
          { href: '/billing', label: 'Credits & billing', short: 'Credits', icon: 'card' },
          { href: '/api-keys', label: 'API keys', short: 'API', icon: 'key' },
          SETTINGS,
        ],
      },
    ];
  }

  if (role === 'manager') {
    return [
      {
        items: [
          { href: '/admin/users', label: 'My clients', short: 'Clients', icon: 'user' },
          { href: '/admin/approvals', label: 'Approvals', icon: 'check', badgeKey: 'pendingApprovals' },
          { href: '/chat', label: 'Chat inbox', short: 'Chat', icon: 'chat', badgeKey: 'unreadChats' },
          { href: '/tickets', label: 'Tickets', icon: 'ticket', badgeKey: 'unreadTickets' },
          { href: '/admin/payments', label: 'Credit requests', short: 'Payments', icon: 'card', badgeKey: 'pendingPayments' },
        ],
      },
      {
        label: 'Support',
        items: [
          { href: '/tickets/reports', label: 'Support reports', short: 'Reports', icon: 'chart' },
          { href: '/tickets/macros', label: 'Macros', icon: 'macro' },
          { href: '/tickets/settings', label: 'SLA & automation', short: 'SLA', icon: 'clock' },
        ],
      },
      { label: 'Account', items: [SETTINGS] },
    ];
  }

  const groups: NavGroup[] = [
    { items: [{ href: '/admin', label: 'Platform overview', short: 'Overview', icon: 'grid' }] },
    {
      label: 'Operations',
      items: [
        { href: '/admin/users', label: 'All users', short: 'Users', icon: 'user' },
        { href: '/admin/approvals', label: 'Approvals', icon: 'check', badgeKey: 'pendingApprovals' },
        { href: '/admin/payments', label: 'Credits & payments', short: 'Payments', icon: 'card', badgeKey: 'pendingPayments' },
        { href: '/tickets', label: 'All tickets', short: 'Tickets', icon: 'ticket', badgeKey: 'unreadTickets' },
        { href: '/admin/audit', label: 'Audit log', short: 'Audit', icon: 'list' },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/tickets/reports', label: 'Support reports', short: 'Reports', icon: 'chart' },
        { href: '/tickets/macros', label: 'Macros', icon: 'macro' },
        { href: '/tickets/settings', label: 'SLA & automation', short: 'SLA', icon: 'clock' },
      ],
    },
  ];
  if (role === 'superadmin') {
    groups.push({
      label: 'Superadmin only',
      items: [
        { href: '/admin/providers', label: 'Indexing providers', short: 'Providers', icon: 'bolt' },
        { href: '/admin/payment-methods', label: 'Payment methods', short: 'Methods', icon: 'coin' },
        { href: '/admin/staff', label: 'Staff & roles', short: 'Staff', icon: 'lock' },
      ],
    });
  } else {
    groups[1].items.push({ href: '/admin/staff', label: 'Managers', icon: 'users' });
  }
  groups.push({ label: 'Account', items: [SETTINGS] });
  return groups;
}

export function isActivePath(pathname: string, href: string): boolean {
  // Section roots whose sub-pages have their own nav entries match exactly.
  if (href === '/' || href === '/admin' || href === '/tickets') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
