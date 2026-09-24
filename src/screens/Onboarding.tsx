import { skipCalibration, startCalibration } from '../engine/session';
import { navigate } from '../app/nav';
import { useApp } from '../app/store';
import { StorageBanner } from './common';

export function Onboarding() {
  const { run } = useApp();
  return (
    <main className="screen onboarding" aria-label="היכרות">
      <header className="masthead">
        <div className="brand">
          <span className="brand-name" lang="en" dir="ltr">
            Sentence Lab
          </span>
          <span className="brand-sub">אנגלית שנבנית נכון</span>
        </div>
      </header>
      <StorageBanner />

      <section className="hero-card onboarding-card">
        <div className="onboarding-badge-icon" aria-hidden="true">
          ⚡
        </div>
        <span className="kicker">אימון דיבור יומי</span>
        <h2>בונים משפטים באנגלית — בקלות ובמהירות</h2>
        <p className="onboarding-lead">
          תרגול ממוקד שמחזק את ההחלטות שעוצרות את שטף הדיבור: פועלי עזר, זמנים, וסדר מילים מדויק.
        </p>

        <div className="onboarding-features">
          <div className="onboarding-feature">
            <span className="feat-icon">⚡</span>
            <div className="feat-text">
              <strong>בחירה ממוקדת</strong>
              <span>שתי אפשרויות חדות — בלי לבזבז זמן על פאזלים ארוכים</span>
            </div>
          </div>
          <div className="onboarding-feature">
            <span className="feat-icon">🔊</span>
            <div className="feat-text">
              <strong>הגייה ואודיו מיידי</strong>
              <span>שומעים כל משפט באנגלית טבעית ורהוטה</span>
            </div>
          </div>
          <div className="onboarding-feature">
            <span className="feat-icon">🎯</span>
            <div className="feat-text">
              <strong>התאמה אישית</strong>
              <span>האפליקציה מתזמנת חזרות בדיוק בזמן הנכון</span>
            </div>
          </div>
        </div>

        <p className="muted small">
          נתחיל בארבעה תרגילים קצרים לכיול נקודת ההתחלה שלך.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-big btn-block"
          onClick={() => {
            run(startCalibration);
            navigate('practice');
          }}
        >
          התחל
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-block"
          onClick={() => run(skipCalibration)}
        >
          דלג על הכיול והתחל מהמסלול המוצע
        </button>
      </section>
    </main>
  );
}
