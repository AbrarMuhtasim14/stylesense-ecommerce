'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getTickets, updateTicketStatus } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/utils';

const ADMIN_PASSWORD_KEY = 'stylesense_admin_pw';

export default function AdminTicketsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [storedPassword, setStoredPassword] = useState('');

  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    const pw = localStorage.getItem(ADMIN_PASSWORD_KEY);
    if (pw) {
      setStoredPassword(pw);
      setIsAuthenticated(true);
    }
  }, []);

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const data = await getTickets(filter === 'all' ? undefined : filter);
      setTickets(data || []);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('403')) {
        handleLogout();
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTickets();
    }
  }, [isAuthenticated, filter]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      localStorage.setItem(ADMIN_PASSWORD_KEY, password);
      setStoredPassword(password);
      setIsAuthenticated(true);
      setAuthError('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
    setIsAuthenticated(false);
    setStoredPassword('');
    setTickets([]);
  };

  const handleAction = async (ticketId: number, action: 'APPROVE' | 'REJECT' | 'ESCALATE', notes: string = '') => {
    setActionLoading(ticketId);
    try {
      await updateTicketStatus(ticketId, action, notes);
      await fetchTickets();
    } catch (err) {
      console.error(err);
      alert('Failed to update ticket');
    } finally {
      setActionLoading(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5' }}>
        <div style={{ background: 'white', padding: 40, borderRadius: 24, width: '100%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Admin Login</h1>
            <p style={{ color: '#71717a', margin: 0 }}>Enter your password to access tickets</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin Password"
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e4e4e7', fontSize: 16, outline: 'none', transition: 'border-color 200ms' }}
                onFocus={(e) => e.target.style.borderColor = '#18181b'}
                onBlur={(e) => e.target.style.borderColor = '#e4e4e7'}
              />
              {authError && <p style={{ color: '#ef4444', fontSize: 13, margin: '8px 0 0' }}>{authError}</p>}
            </div>
            <button
              type="submit"
              disabled={!password}
              style={{ width: '100%', padding: '14px', background: password ? '#18181b' : '#e4e4e7', color: password ? 'white' : '#a1a1aa', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: password ? 'pointer' : 'not-allowed', transition: 'all 200ms' }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f5', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px' }}>Ticket Management</h1>
            <p style={{ color: '#71717a', margin: 0 }}>Review returns, disputes, and cancellations</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/admin">
              <button style={{ padding: '10px 20px', background: 'white', border: '1px solid #e4e4e7', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
                Products
              </button>
            </Link>
            <button onClick={handleLogout} style={{ padding: '10px 20px', background: 'white', border: '1px solid #e4e4e7', borderRadius: 12, fontWeight: 600, cursor: 'pointer', color: '#ef4444' }}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 24, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', gap: 12 }}>
            {['all', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'APPROVED', 'REJECTED'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 100,
                  background: filter === f ? '#18181b' : '#f4f4f5',
                  color: filter === f ? 'white' : '#71717a',
                  border: 'none',
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div style={{ padding: 24 }}>
            {isLoading ? (
              <p>Loading tickets...</p>
            ) : tickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a' }}>
                <p>No tickets found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {tickets.map((ticket) => (
                  <div key={ticket.id} style={{ border: '1px solid #e4e4e7', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{ background: '#f4f4f5', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                            {ticket.type}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 
                            ticket.status === 'APPROVED' ? '#10b981' : 
                            ticket.status === 'REJECTED' ? '#ef4444' : '#f59e0b'
                          }}>
                            {ticket.status}
                          </span>
                          <span style={{ fontSize: 13, color: '#a1a1aa' }}>
                            {formatDate(ticket.created_at)}
                          </span>
                        </div>
                        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Order: {ticket.orders?.order_number}</h3>
                        <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>{ticket.customer_email}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{formatPrice(ticket.orders?.total_price)}</p>
                      </div>
                    </div>
                    
                    <div style={{ background: '#f9fafb', padding: 16, borderRadius: 12 }}>
                      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Reason:</p>
                      <p style={{ margin: 0, fontSize: 14 }}>{ticket.reason || 'No reason provided'}</p>
                    </div>

                    {ticket.evidence_url && (
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Evidence:</p>
                        <a href={ticket.evidence_url} target="_blank" rel="noreferrer">
                          <img src={ticket.evidence_url} alt="Evidence" style={{ height: 100, borderRadius: 8, border: '1px solid #e4e4e7' }} />
                        </a>
                      </div>
                    )}

                    {ticket.resolution_notes && (
                      <div style={{ background: ticket.status === 'APPROVED' ? '#ecfdf5' : '#fef2f2', padding: 16, borderRadius: 12 }}>
                        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Resolution Notes:</p>
                        <p style={{ margin: 0, fontSize: 14 }}>{ticket.resolution_notes}</p>
                      </div>
                    )}

                    {['UNDER_REVIEW', 'AWAITING_EVIDENCE', 'REQUESTED'].includes(ticket.status) && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        <button
                          onClick={() => handleAction(ticket.id, 'APPROVE')}
                          disabled={actionLoading === ticket.id}
                          style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(ticket.id, 'REJECT')}
                          disabled={actionLoading === ticket.id}
                          style={{ padding: '8px 16px', background: 'white', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
