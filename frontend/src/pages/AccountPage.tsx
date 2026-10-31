import ChangePasswordForm from '../components/account/ChangePasswordForm';
import DeleteAccountSection from '../components/account/DeleteAccountSection';
import ReminderHistory from '../components/account/ReminderHistory';
import ReminderSettings from '../components/account/ReminderSettings';
import SetPasswordSection from '../components/account/SetPasswordSection';
import TimezoneForm from '../components/account/TimezoneForm';
import { useCurrentUser } from '../context/AuthContext';
import { formatDate } from '../utils/format';

export default function AccountPage() {
  const user = useCurrentUser();

  return (
    <main className="page">
      <h1>Account</h1>

      <section className="card">
        <h2>Details</h2>
        <div className="profile-field">
          <span className="profile-label">Email</span>
          <span>{user.email}</span>
        </div>
        <div className="profile-field">
          <span className="profile-label">Member since</span>
          <span>{formatDate(user.createdAt.slice(0, 10))}</span>
        </div>
      </section>

      <section className="card">
        <h2>Reminders</h2>
        <ReminderSettings />
      </section>

      <section className="card">
        <h2>Recent reminders</h2>
        <ReminderHistory />
      </section>

      <section className="card">
        <h2>Timezone</h2>
        <TimezoneForm />
      </section>

      <section className="card">
        <h2>Password</h2>
        {user.hasPassword ? <ChangePasswordForm /> : <SetPasswordSection />}
      </section>

      <section className="card danger-zone">
        <h2>Delete account</h2>
        <DeleteAccountSection />
      </section>
    </main>
  );
}
