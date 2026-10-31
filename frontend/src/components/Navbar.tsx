import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-left">
        <Link className="brand" to="/" aria-label="Subtracker home">
          <span className="brand-name">Subtracker</span>
        </Link>

        {/* NavLink adds an "active" class to the link for the current page */}
        {user && (
          <nav className="nav-links">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/subscriptions">Subscriptions</NavLink>
            <NavLink to="/calendar">Calendar</NavLink>
            <NavLink to="/account">Account</NavLink>
          </nav>
        )}
      </div>

      {user && (
        <button className="button secondary" onClick={logout}>
          Log out
        </button>
      )}
    </header>
  );
}
