import { MORE_LINKS } from './links';
import './neopets-more.css';

export function NeopetsMoreApp() {
  return (
    <div className="more-app">
      <div className="hub-sticky-chrome more-sticky-chrome">
        <header className="page_title site-header">
          <div className="site-header-start">
            <h1>Neopets More</h1>
          </div>
        </header>
      </div>
      <div className="more-body">
        <div className="grid more-grid">
          {MORE_LINKS.map((link) => (
            <div key={link.id} className="daily-tile">
              <a href={link.url} target="_blank" rel="noreferrer">
                <img src={link.img} alt="" />
              </a>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
              {link.note ? <span className="text-small">{link.note}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
