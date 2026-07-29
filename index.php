<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>磁磚 AI 智能客服系統</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
:root {
  --black: #0a0a0a;
  --white: #f8f5f0;
  --cream: #f0ebe2;
  --green: #1a5c3a;
  --green-light: #2d8a57;
  --green-pale: #e8f5ee;
  --gold: #c9933a;
  --gold-light: #f0c97a;
  --line-green: #06C755;
  --gray: #6b6b6b;
  --gray-light: #e8e4de;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  font-family: 'Noto Sans TC', sans-serif;
  background: var(--white);
  color: var(--black);
  overflow-x: hidden;
}

/* ── HERO ── */
.hero {
  min-height: 100vh;
  background: var(--black);
  display: grid;
  grid-template-columns: 1fr 1fr;
  position: relative;
  overflow: hidden;
}

.hero-bg-pattern {
  position: absolute; inset: 0;
  background-image:
    radial-gradient(circle at 20% 50%, rgba(26,92,58,0.25) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(201,147,58,0.1) 0%, transparent 40%);
}

.hero-grid-lines {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}

.hero-left {
  display: flex; flex-direction: column; justify-content: center;
  padding: 80px 60px 80px 80px;
  position: relative; z-index: 2;
}

.hero-tag {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(6,199,85,0.15); border: 1px solid rgba(6,199,85,0.3);
  color: var(--line-green); font-size: 12px; font-weight: 500; letter-spacing: .1em;
  padding: 6px 14px; border-radius: 20px; margin-bottom: 32px;
  width: fit-content;
}

.hero-tag::before {
  content: ''; width: 6px; height: 6px; background: var(--line-green);
  border-radius: 50%; animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.hero-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 52px; font-weight: 900; line-height: 1.2;
  color: var(--white); margin-bottom: 8px;
}

.hero-title-accent {
  color: var(--gold-light);
  display: block;
}

.hero-subtitle {
  font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 48px;
  line-height: 1.8; font-weight: 300;
}

.hero-cta-row { display: flex; gap: 14px; flex-wrap: wrap; }

.btn-primary {
  background: var(--line-green); color: #fff;
  padding: 14px 32px; border-radius: 6px;
  font-size: 15px; font-weight: 700; border: none; cursor: pointer;
  text-decoration: none; display: inline-block;
  transition: transform .2s, box-shadow .2s;
  letter-spacing: .05em;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(6,199,85,0.3); }

.btn-secondary {
  background: transparent; color: var(--white);
  padding: 14px 32px; border-radius: 6px;
  font-size: 15px; font-weight: 500; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;
  text-decoration: none; display: inline-block;
  transition: border-color .2s, background .2s;
}
.btn-secondary:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); }

.hero-stats {
  display: flex; gap: 40px; margin-top: 56px;
  padding-top: 40px; border-top: 1px solid rgba(255,255,255,0.08);
}
.stat-item { }
.stat-num { font-family: 'Noto Serif TC', serif; font-size: 32px; font-weight: 900; color: var(--gold-light); }
.stat-label { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }

/* ── PHONE MOCKUP ── */
.hero-right {
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2; padding: 60px 40px;
}

.phone-wrap {
  position: relative;
  animation: float 4s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}

.phone {
  width: 280px; height: 560px;
  background: #1a1a1a;
  border-radius: 40px;
  border: 2px solid rgba(255,255,255,0.1);
  box-shadow: 0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
  overflow: hidden;
  position: relative;
}

.phone-notch {
  width: 100px; height: 28px;
  background: #1a1a1a;
  border-radius: 0 0 18px 18px;
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  z-index: 10;
}

.phone-screen {
  height: 100%; display: flex; flex-direction: column;
  background: #f0f0f0;
}

.line-header {
  background: #ffffff;
  padding: 44px 14px 10px;
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid #e8e8e8;
}

.line-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--line-green);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0;
}

.line-name { font-size: 13px; font-weight: 700; color: #333; }
.line-status { font-size: 10px; color: #06C755; }

.chat-area {
  flex: 1; overflow-y: auto; padding: 14px 10px;
  display: flex; flex-direction: column; gap: 10px;
  scrollbar-width: none;
}

.msg-row { display: flex; align-items: flex-end; gap: 6px; }
.msg-row.user { flex-direction: row-reverse; }

.msg-avatar-small {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  background: var(--line-green);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #fff; font-weight: 700;
}

.bubble {
  max-width: 180px; padding: 8px 11px; border-radius: 14px;
  font-size: 11px; line-height: 1.6; color: #333;
}

.bubble.bot {
  background: #fff; border-radius: 4px 14px 14px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.bubble.user {
  background: #c8f5d8; border-radius: 14px 4px 14px 14px;
  color: #1a3d26;
}

.bubble-green {
  background: var(--line-green); color: #fff;
  border-radius: 4px 14px 14px 14px;
  padding: 8px 11px; font-size: 11px; max-width: 180px;
}

.inventory-card {
  background: #fff; border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  font-size: 10px; max-width: 190px;
  border-left: 3px solid var(--line-green);
}

.inv-title { font-weight: 700; font-size: 11px; margin-bottom: 5px; color: #1a3d26; }
.inv-row { display: flex; justify-content: space-between; color: #666; margin: 2px 0; }
.inv-status { color: var(--line-green); font-weight: 700; font-size: 11px; margin-top: 5px; }

.quick-btns {
  display: flex; gap: 5px; flex-wrap: wrap; padding: 8px 10px;
  background: #fff; border-top: 1px solid #e8e8e8;
}
.qbtn {
  background: #f0f0f0; border-radius: 14px; padding: 4px 10px;
  font-size: 9px; color: #444; white-space: nowrap;
}

/* glow behind phone */
.phone-glow {
  position: absolute;
  width: 300px; height: 300px;
  background: radial-gradient(circle, rgba(26,92,58,0.3) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: -1;
}

/* ── SECTION COMMON ── */
section { padding: 100px 80px; }
.section-tag {
  font-size: 11px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase;
  color: var(--green); margin-bottom: 14px;
}
.section-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 38px; font-weight: 900; line-height: 1.3;
  margin-bottom: 16px;
}
.section-desc { font-size: 16px; color: var(--gray); line-height: 1.9; max-width: 560px; }

/* ── HOW IT WORKS ── */
.how-section { background: var(--black); color: var(--white); }
.how-section .section-tag { color: var(--gold-light); }
.how-section .section-title { color: var(--white); }
.how-section .section-desc { color: rgba(255,255,255,0.5); }

.how-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 2px; margin-top: 60px;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; overflow: hidden;
}

.how-item {
  padding: 40px 32px;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.07);
  transition: background .3s;
}
.how-item:last-child { border-right: none; }
.how-item:hover { background: rgba(255,255,255,0.05); }

.how-num {
  font-family: 'Noto Serif TC', serif;
  font-size: 48px; font-weight: 900;
  color: rgba(201,147,58,0.2); line-height: 1; margin-bottom: 20px;
}

.how-icon {
  width: 44px; height: 44px; border-radius: 10px;
  background: rgba(26,92,58,0.3); border: 1px solid rgba(26,92,58,0.5);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; margin-bottom: 18px;
}

.how-title { font-size: 18px; font-weight: 700; color: var(--white); margin-bottom: 10px; }
.how-desc { font-size: 14px; color: rgba(255,255,255,0.4); line-height: 1.8; }

/* ── DEMO SECTION ── */
.demo-section { background: var(--cream); }
.demo-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }

.demo-chat-window {
  background: #fff; border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.1);
  overflow: hidden; border: 1px solid var(--gray-light);
}

.demo-chat-header {
  background: var(--green); padding: 18px 24px;
  display: flex; align-items: center; gap: 12px;
}

.demo-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
}

.demo-name { color: #fff; font-weight: 700; font-size: 15px; }
.demo-sub { color: rgba(255,255,255,0.7); font-size: 12px; }

.demo-msgs { padding: 24px; display: flex; flex-direction: column; gap: 14px; height: 520px; overflow-y: auto; scrollbar-width: none; }
.demo-msgs::-webkit-scrollbar { display: none; }

.dmsg { display: flex; gap: 10px; align-items: flex-start; }
.dmsg.right { flex-direction: row-reverse; }

.dav {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: var(--green); display: flex; align-items: center;
  justify-content: center; font-size: 13px; color: #fff; font-weight: 700;
}
.dav.user-av { background: #e0e0e0; font-size: 13px; }

.dbubble {
  background: #f5f5f5; border-radius: 4px 14px 14px 14px;
  padding: 10px 14px; font-size: 13px; line-height: 1.7;
  max-width: 300px; color: #333;
}
.dbubble.right { background: #c8f5d8; border-radius: 14px 4px 14px 14px; color: #1a3d26; }
.dbubble.green-bg { background: var(--green); color: #fff; border-radius: 4px 14px 14px 14px; }

.result-card {
  background: #fff; border-radius: 12px; padding: 16px 18px;
  border-left: 4px solid var(--line-green);
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); max-width: 320px;
}
.rc-title { font-weight: 700; font-size: 14px; color: var(--green); margin-bottom: 8px; }
.rc-row { display: flex; justify-content: space-between; font-size: 13px; color: #555; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
.rc-row:last-child { border-bottom: none; }
.rc-row span:last-child { font-weight: 600; color: var(--black); }
.rc-status { margin-top: 8px; color: var(--line-green); font-weight: 700; font-size: 13px; }

.demo-queries { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding: 0 24px 20px; }
.dq {
  background: var(--green-pale); color: var(--green);
  border: 1px solid rgba(26,92,58,0.2);
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background .2s;
}
.dq:hover { background: var(--green); color: #fff; }

.demo-text .section-title { font-size: 32px; }
.demo-feature-list { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.df-item { display: flex; gap: 12px; align-items: flex-start; }
.df-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  background: var(--green-pale); border: 1px solid rgba(26,92,58,0.15);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.df-title { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
.df-desc { font-size: 12px; color: var(--gray); line-height: 1.5; }

/* ── PRICING ── */
.pricing-section { background: var(--white); }
.pricing-top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 60px; }

.group-divider {
  display: flex; gap: 12px; align-items: center; margin-bottom: 12px;
}
.group-tag {
  font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  padding: 4px 12px; border-radius: 20px;
}
.group-tag.int { background: var(--gray-light); color: var(--gray); }
.group-tag.ext { background: rgba(6,199,85,0.12); color: var(--green); }
.group-line { flex: 1; height: 1px; background: var(--gray-light); }

.pricing-groups { display: grid; grid-template-columns: 2fr 3fr; gap: 24px; }
.plan-group { }
.plan-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.plan-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }

.plan-card {
  background: var(--white); border: 1px solid var(--gray-light);
  border-radius: 16px; padding: 24px 20px;
  display: flex; flex-direction: column;
  transition: transform .2s, box-shadow .2s, border-color .2s;
  position: relative;
}
.plan-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.08); }
.plan-card.highlight { border: 2px solid var(--line-green); }
.plan-card.highlight::before {
  content: '最推薦';
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: var(--line-green); color: #fff;
  font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 20px;
}

.plan-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.plan-tagline { font-size: 11px; color: var(--gray); margin-bottom: 16px; }

.price-area { background: var(--cream); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.price-monthly { font-size: 20px; font-weight: 900; color: var(--black); }
.price-monthly span { font-size: 12px; font-weight: 400; color: var(--gray); }
.price-yearly { font-size: 12px; color: var(--gray); margin-top: 3px; }
.price-save { font-size: 11px; color: var(--green); font-weight: 600; }
.price-setup { font-size: 11px; color: var(--gray); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--gray-light); }

.plan-features { flex: 1; display: flex; flex-direction: column; gap: 5px; margin-bottom: 16px; }
.pf { font-size: 11px; color: #555; display: flex; gap: 6px; align-items: flex-start; line-height: 1.5; }
.pf::before { content: '✓'; color: var(--green); font-weight: 700; flex-shrink: 0; }
.pf.inherited { color: #aaa; }
.pf.inherited::before { content: '·'; color: #ccc; }

.plan-users {
  font-size: 10px; font-weight: 600; letter-spacing: .05em;
  padding: 5px 10px; border-radius: 20px; text-align: center;
}
.plan-users.int { background: var(--gray-light); color: var(--gray); }
.plan-users.ext { background: rgba(6,199,85,0.1); color: var(--green); }

/* ── POLICY NOTES ── */
.policy-notes {
  display: flex; flex-wrap: wrap; gap: 10px;
  margin-top: 28px; margin-bottom: 4px;
}
.policy-note {
  display: flex; align-items: center; gap: 8px;
  background: var(--cream); border: 1px solid var(--gray-light);
  border-radius: 8px; padding: 10px 16px;
  font-size: 13px; color: var(--gray); flex: 1; min-width: 200px;
}
.policy-note .pn-icon { font-size: 15px; flex-shrink: 0; }
.policy-note strong { color: var(--black); font-weight: 600; }

/* ── SETUP FEE ── */
.setup-banner {
  background: var(--black); color: var(--white);
  border-radius: 16px; padding: 32px 40px;
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 40px;
}
.setup-left { }
.setup-title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.setup-desc { font-size: 13px; color: rgba(255,255,255,0.5); }
.setup-items { display: flex; gap: 24px; }
.setup-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7); }
.setup-item::before { content: '✓'; color: var(--line-green); font-weight: 700; }
.setup-price-big { font-family: 'Noto Serif TC', serif; font-size: 42px; font-weight: 900; color: var(--gold-light); white-space: nowrap; }
.setup-price-label { font-size: 12px; color: rgba(255,255,255,0.4); text-align: right; }

/* ── FAQ ── */
.faq-section { background: var(--cream); }
.faq-inner { display: grid; grid-template-columns: 1fr 2fr; gap: 80px; }
.faq-list { display: flex; flex-direction: column; gap: 2px; }
.faq-item { border-bottom: 1px solid rgba(0,0,0,0.08); }
.faq-q {
  padding: 18px 0; font-size: 15px; font-weight: 500;
  cursor: pointer; display: flex; justify-content: space-between; align-items: center;
  color: var(--black);
}
.faq-q:hover { color: var(--green); }
.faq-icon { font-size: 20px; color: var(--green); transition: transform .3s; flex-shrink: 0; }
.faq-a {
  font-size: 14px; color: var(--gray); line-height: 1.8;
  max-height: 0; overflow: hidden; transition: max-height .3s ease, padding .3s;
}
.faq-item.open .faq-a { max-height: 200px; padding-bottom: 16px; }
.faq-item.open .faq-icon { transform: rotate(45deg); }

/* ── CTA FOOTER ── */
.cta-section {
  background: var(--green);
  padding: 100px 80px; text-align: center;
}
.cta-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 44px; font-weight: 900; color: #fff; margin-bottom: 16px;
}
.cta-desc { font-size: 17px; color: rgba(255,255,255,0.75); margin-bottom: 40px; }
.cta-btns { display: flex; gap: 14px; justify-content: center; }
.btn-white {
  background: #fff; color: var(--green);
  padding: 16px 40px; border-radius: 6px;
  font-size: 16px; font-weight: 700; border: none; cursor: pointer;
  text-decoration: none; display: inline-block;
  transition: transform .2s, box-shadow .2s;
}
.btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
.btn-outline-white {
  background: transparent; color: #fff;
  padding: 16px 40px; border-radius: 6px;
  font-size: 16px; font-weight: 500; border: 2px solid rgba(255,255,255,0.4); cursor: pointer;
  text-decoration: none; display: inline-block;
  transition: border-color .2s;
}
.btn-outline-white:hover { border-color: #fff; }

footer {
  background: var(--black); color: rgba(255,255,255,0.3);
  padding: 32px 80px; text-align: center; font-size: 13px;
}

/* ── SCROLL ANIMATIONS ── */
.fade-in {
  opacity: 0; transform: translateY(24px);
  transition: opacity .6s ease, transform .6s ease;
}
.fade-in.visible { opacity: 1; transform: translateY(0); }

/* ── PAYMENT & CUSTOMIZATION ── */
.payment-custom-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 40px;
}
.payment-card, .custom-card {
  background: var(--cream);
  border: 1px solid var(--gray-light);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: transform .2s, box-shadow .2s;
}
.payment-card:hover, .custom-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.04);
}
.pay-title, .cust-title {
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pay-title { color: var(--green); }
.cust-title { color: var(--gold); }
.pay-details, .cust-details {
  font-size: 14px;
  line-height: 1.8;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pay-details strong, .cust-details strong {
  color: var(--black);
}

@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; }
  .hero-right { display: none; }
  .hero-left { padding: 60px 32px; }
  .hero-title { font-size: 36px; }
  section { padding: 60px 32px; }
  .how-grid { grid-template-columns: 1fr; }
  .demo-inner { grid-template-columns: 1fr; }
  .pricing-groups { grid-template-columns: 1fr; }
  .plan-grid-3 { grid-template-columns: 1fr; }
  .plan-grid-2 { grid-template-columns: 1fr; }
  .policy-notes { flex-direction: column; }
  .policy-note { min-width: unset; }
  .payment-custom-section { grid-template-columns: 1fr; gap: 16px; }
  .setup-banner { flex-direction: column; gap: 24px; text-align: center; }
  .setup-items { flex-direction: column; align-items: center; }
  .faq-inner { grid-template-columns: 1fr; }
  .pricing-top { flex-direction: column; gap: 20px; align-items: flex-start; }
  .cta-section { padding: 60px 32px; }
  .cta-title { font-size: 32px; }
  footer { padding: 24px 32px; }
}
</style>
</head>
<body>

<!-- ── HERO ── -->
<section class="hero">
  <div class="hero-bg-pattern"></div>
  <div class="hero-grid-lines"></div>

  <div class="hero-left">
    <div class="hero-tag">LINE AI 智能客服系統</div>
    <h1 class="hero-title">
      磁磚業
      <span class="hero-title-accent">最懂你的</span>
      AI 助理
    </h1>
    <p class="hero-subtitle">
      不用換系統、不用學新軟體。<br>
      在 LINE 上直接查庫存、看圖片、下保留單，<br>
      業務效率立刻翻倍。
    </p>
    <div class="hero-cta-row">
      <a href="#pricing" class="btn-primary">查看方案與定價</a>
      <a href="demo.html" class="btn-secondary" target="_blank">📱 互動功能演示</a>
    </div>
    <div class="hero-stats">
      <div class="stat-item">
        <div class="stat-num" id="stat-plan-count">5</div>
        <div class="stat-label">方案等級選擇</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" id="stat-min-price">$9,900/年</div>
        <div class="stat-label">最低年繳方案</div>
      </div>
      <div class="stat-item">
        <div class="stat-num" id="stat-setup-fee">$6,000</div>
        <div class="stat-label">統一建置費</div>
      </div>
    </div>
  </div>

  <div class="hero-right">
    <div class="phone-wrap">
      <div class="phone-glow"></div>
      <div class="phone">
        <div class="phone-notch"></div>
        <div class="phone-screen">
          <div class="line-header">
            <div class="line-avatar">AI</div>
            <div>
              <div class="line-name">磁磚智能助理</div>
              <div class="line-status">● 線上</div>
            </div>
          </div>
          <div class="chat-area">
            <div class="msg-row user">
              <div class="bubble user">GW6012 有30坪嗎？</div>
            </div>
            <div class="msg-row">
              <div class="msg-avatar-small">AI</div>
              <div class="inventory-card">
                <div class="inv-title">🟢 庫存充足</div>
                <div class="inv-row"><span>編號</span><span>GW6012</span></div>
                <div class="inv-row"><span>尺寸</span><span>60x120</span></div>
                <div class="inv-row"><span>需求</span><span>30坪</span></div>
                <div class="inv-row"><span>可用</span><span>87坪</span></div>
                <div class="inv-status">有貨喔！快下單 🛒</div>
              </div>
            </div>
            <div class="msg-row user">
              <div class="bubble user">GW6012 圖片</div>
            </div>
            <div class="msg-row">
              <div class="msg-avatar-small">AI</div>
              <div class="bubble bot">為您找到實景照片 👇<br>可左右滑動查看</div>
            </div>
            <div class="msg-row user">
              <div class="bubble user">白色 60x120 有哪些？</div>
            </div>
            <div class="msg-row">
              <div class="msg-avatar-small">AI</div>
              <div class="bubble-green">
                找到 8 款白色系 60x120<br>
                全部庫存充足 ✨
              </div>
            </div>
          </div>
          <div class="quick-btns">
            <div class="qbtn">💰 查價格</div>
            <div class="qbtn">🖼️ 看圖片</div>
            <div class="qbtn">📌 查保留</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── HOW IT WORKS ── -->
<section class="how-section fade-in">
  <div class="section-tag">使用流程</div>
  <h2 class="section-title">三步驟，馬上開始用</h2>
  <p class="section-desc">不需要安裝 App、不需要登入後台。業務與客戶只要有 LINE，就能直接使用。</p>

  <div class="how-grid">
    <div class="how-item">
      <div class="how-num">01</div>
      <div class="how-icon">🏗️</div>
      <div class="how-title">我們幫你建置</div>
      <div class="how-desc">一次性建置費 $6,000，包含 Google 帳號、雲端硬碟、LINE 官方帳號全部設定完成，你不需要做任何技術工作。</div>
    </div>
    <div class="how-item">
      <div class="how-num">02</div>
      <div class="how-icon">📊</div>
      <div class="how-title">匯入你的資料</div>
      <div class="how-desc">把庫存表、價目表、產品圖片上傳到 Google Sheets 和雲端硬碟。我們提供標準格式範本，照著填就好。</div>
    </div>
    <div class="how-item">
      <div class="how-num">03</div>
      <div class="how-icon">💬</div>
      <div class="how-title">直接在 LINE 使用</div>
      <div class="how-desc">業務加入 LINE 官方帳號後，直接用中文輸入查詢，系統即時回覆。就像傳 LINE 給同事一樣簡單。</div>
    </div>
  </div>
</section>

<!-- ── DEMO ── -->
<section class="demo-section fade-in" id="demo">
  <div class="demo-inner">
    <div class="demo-chat-window">
      <div class="demo-chat-header">
        <div class="demo-avatar">🤖</div>
        <div>
          <div class="demo-name">磁磚 AI 助理</div>
          <div class="demo-sub">即時回覆 · 24小時待命</div>
        </div>
      </div>
      <div class="demo-msgs">
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble">嗨！我是您的磁磚小幫手。直接輸入「型號」就能查庫存喔！👇</div>
        </div>
        
        <!-- 1. 基本查庫存 -->
        <div class="dmsg right" id="msg-basic">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">36033</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble" style="font-family: monospace; white-space: pre-wrap; line-height:1.5;">🟢 &lt;庫存充足&gt;
🆔 編號：RT36033
📚 系列：冰岩
📐 尺寸：30X60
📦 狀態：有貨喔!!快點下單 😆🛒
📌 保留：29.1 坪 (523片) / 6 筆
📊 可用：44.8 坪
────────
🔢 批號明細：
⬜ GP4S/8：1.8 坪 (33片)
⬜ HA4S/8：72.1 坪 (1297片)</div>
        </div>

        <!-- 2. 基本查保留 -->
        <div class="dmsg right" id="msg-reserve">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">36033 保留</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble" style="white-space: pre-wrap; line-height:1.5;">⭐ 36033 共6筆保留 ⭐
─────
⭐ 36033 | KEN 2筆 ⭐
─────
漢樺 | KEN
互助典藏
RT36033 | 40片
01/02 | 🔴 留 136天
訂金：未付
備註：2月</div>
        </div>

        <!-- 3. 查重量包裝 -->
        <div class="dmsg right" id="msg-weight">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">36033 重量包裝</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble green-bg">
            📦 <b>RT36033 包裝資訊</b><br>
            • 規格：8片/箱 (0.44坪)<br>
            • 重量：17.5kg / 箱
          </div>
        </div>

        <!-- 4. 查圖片 -->
        <div class="dmsg right" id="msg-image">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">36033 圖片</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="result-card" style="margin-left:0; padding:0; overflow:hidden; width:100%;">
            <div style="height:140px; background:url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400') center/cover;"></div>
            <div style="padding:12px;">
              <div style="font-size:16px; font-weight:bold; color:#333;">冰岩</div>
              <div style="font-size:12px; color:#888; margin-bottom:10px;">🆔 RT36033 吹雪 (1)</div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="background:#444; color:#fff; text-align:center; padding:6px; border-radius:6px; font-size:12px;">下載模面</div>
                <div style="background:#444; color:#fff; text-align:center; padding:6px; border-radius:6px; font-size:12px;">產品目錄</div>
                <div style="background:#444; color:#fff; text-align:center; padding:6px; border-radius:6px; font-size:12px;">系列文宣</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 5. 尺寸條件搜尋 -->
        <div class="dmsg right" id="msg-search">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">找灰色 60x120 庫存50坪以上</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble">為您篩選出 4 款符合條件的產品... 👇</div>
        </div>

        <!-- 6. 客戶分級保護 -->
        <div class="dmsg right">
          <div class="dav user-av">👤</div>
          <div class="dbubble right">我是客戶，36033 有貨嗎？</div>
        </div>
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble">您好！請輸入您需要的「坪數」或「數量」，例如：「36033 20坪」，我幫您確認數量是否足夠喔！</div>
        </div>

        <!-- 7. 報表推播 -->
        <div class="dmsg">
          <div class="dav">AI</div>
          <div class="dbubble green-bg" style="white-space: pre-wrap; line-height:1.6;">📊 <b>今日業績日報 (主管版)</b>
當日業績：$145,000
本月累計：$1,230,000
────────
⚠️ <b>滯銷警示</b>
系統偵測到 3 款產品滯銷超過 90 天，請點擊下方按鈕查看完整月報分析。</div>
        </div>

      </div>
      <div class="demo-queries">
        <div class="dq" onclick="scrollToMsg('msg-basic')">36033</div>
        <div class="dq" onclick="scrollToMsg('msg-reserve')">36033 保留</div>
        <div class="dq" onclick="scrollToMsg('msg-weight')">36033 重量</div>
        <div class="dq" onclick="scrollToMsg('msg-image')">36033 圖片</div>
        <div class="dq" onclick="scrollToMsg('msg-search')">灰色 60x120</div>
      </div>
    </div>

    <div class="demo-text">
      <div class="section-tag">從入門到進階，全方位支援</div>
      <h2 class="section-title">功能完整展示</h2>
      <p class="section-desc">不論是日常查貨、客戶保護，還是主管看報表，不同方案滿足不同角色的需求。（左側對話框可上下滑動檢視）</p>
      <a href="demo.html" class="btn-primary" target="_blank" style="display:inline-block;margin:16px 0 8px;font-size:13px;">📱 查看手機滑動互動演示 →</a>
      <div class="demo-feature-list">
        <div class="df-item">
          <div class="df-icon">1️⃣</div>
          <div>
            <div class="df-title">基本查庫存 (入門功能)</div>
            <div class="df-desc">輸入型號，快速獲取精準庫存數量、批號與紅綠燈狀態。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">2️⃣</div>
          <div>
            <div class="df-title">基本查保留 (實用版本)</div>
            <div class="df-desc">查詢產品目前被保留的總坪數，與各筆經銷商保留明細。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">3️⃣</div>
          <div>
            <div class="df-title">查重量包裝 (實用版本)</div>
            <div class="df-desc">查詢單箱重量、片數，方便業務即時安排物流與搬運。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">4️⃣</div>
          <div>
            <div class="df-title">查圖片 (圖庫版本)</div>
            <div class="df-desc">輸入型號+圖片，自動回傳實景照片與產品目錄下載連結。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">5️⃣</div>
          <div>
            <div class="df-title">尺寸條件搜尋 (圖庫版本)</div>
            <div class="df-desc">用顏色、尺寸等條件模糊搜尋，系統自動推薦庫存充足的替代品。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">6️⃣</div>
          <div>
            <div class="df-title">客戶隱私保護 (外部使用版)</div>
            <div class="df-desc">客戶需輸入需求數量，系統只回覆「是否夠用」，隱藏真實總數。</div>
          </div>
        </div>
        <div class="df-item">
          <div class="df-icon">7️⃣</div>
          <div>
            <div class="df-title">業績報表與推播（進階方案）</div>
            <div class="df-desc">系統自動推播每日業績、週報、月報，以及滯銷產品警示給主管。</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── PRICING ── -->
<section class="pricing-section fade-in" id="pricing">
  <div class="pricing-top">
    <div>
      <div class="section-tag">方案與定價</div>
      <h2 class="section-title">選擇適合你的方案</h2>
    </div>
    <p style="font-size:14px;color:var(--gray);max-width:300px;text-align:right;line-height:1.8;">
      所有方案均含完整技術支援<br>
      年繳可省最多 17%<br>
      升級只補差額，建置費不重複收
    </p>
  </div>

  <div class="pricing-groups" id="pricing-groups-mount">
    <!-- 由 PRICING_CONFIG 自動渲染 -->
  </div>

  <div class="policy-notes">
    <div class="policy-note">
      <span class="pn-icon">💳</span>
      <span><strong>年繳一次結清</strong>，非每年重新繳費</span>
    </div>
    <div class="policy-note">
      <span class="pn-icon">⬆️</span>
      <span>功能升級<strong>只補價差</strong>，不重複計費</span>
    </div>
    <div class="policy-note">
      <span class="pn-icon">🛠️</span>
      <span>上線後 <strong>3 個月內</strong> Bug 無償處理</span>
    </div>
    <div class="policy-note">
      <span class="pn-icon">📋</span>
      <span>第 4 個月起修改費用 <strong>$2,000 / 次</strong></span>
    </div>
    <div class="policy-note">
      <span class="pn-icon">🔄</span>
      <span>第二年起系統維護費 <strong>$6,000 / 年</strong></span>
    </div>
  </div>

  <div class="setup-banner">
    <div class="setup-left">
      <div class="setup-title" id="setup-title">建置費 $6,000（一次性，所有方案相同）</div>
      <div class="setup-desc">不管選哪個方案，建置費都一樣。升級方案不重複收取。</div>
      <div class="setup-items" id="setup-items" style="margin-top:16px;">
        <div class="setup-item">Google 帳號建置</div>
        <div class="setup-item">雲端硬碟建置</div>
        <div class="setup-item">LINE 官方帳號建置</div>
        <div class="setup-item">教育訓練</div>
      </div>
    </div>
    <div>
      <div class="setup-price-label">一次性建置費</div>
      <div class="setup-price-big" id="setup-price-big">$6,000</div>
    </div>
  </div>

  <div class="payment-custom-section">
    <div class="payment-card">
      <div class="pay-title">
        <span class="pn-icon">💳</span> 付款方式
      </div>
      <div class="pay-details">
        <div>
          <strong>方案 1~2：先使用後付款</strong>
          <p style="margin-top: 4px; color: var(--gray); font-size: 13px;">上線測試三天，功能無誤後，結清付款。</p>
        </div>
        <div style="border-top: 1px solid var(--gray-light); padding-top: 12px;">
          <strong>方案 3~5：分階段付款</strong>
          <p style="margin-top: 4px; color: var(--gray); font-size: 13px;">會先完成方案 2 的功能，支付首期 19,900 元後，再測試附加功能，支付 2 萬元。測試後七天無誤後結清尾款。</p>
        </div>
      </div>
    </div>
    
    <div class="custom-card">
      <div class="cust-title">
        <span class="pn-icon">🛠️</span> 客製化功能費用
      </div>
      <div class="cust-details">
        <div>
          <strong>依實際每日人工費用另外報價</strong>
          <p style="margin-top: 8px; color: var(--gray); font-size: 13px;">包含以下項目或其他特殊需求：</p>
          <ul style="margin-top: 8px; padding-left: 20px; color: var(--gray); font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
            <li>串接 ERP 系統</li>
            <li>特殊客戶分級權限</li>
            <li>客製化表單設計</li>
            <li>其它特定功能需求開發</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── FAQ ── -->
<section class="faq-section fade-in">
  <div class="faq-inner">
    <div>
      <div class="section-tag">常見問題</div>
      <h2 class="section-title" style="font-size:32px;">有疑問？<br>看這裡</h2>
      <p class="section-desc" style="font-size:14px;margin-top:16px;">還有其他問題？歡迎直接聯繫我們，我們會在一個工作天內回覆。</p>
    </div>
    <div class="faq-list">
      <div class="faq-item open">
        <div class="faq-q" onclick="toggleFaq(this)">
          LINE 官方帳號的訊息費用誰負擔？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">LINE 官方帳號的每月訊息費用由客戶自行申請與負擔，不包含在系統月費內。一般磁磚業者每月訊息量，使用 LINE 官方帳號輕用量方案（免費額度內）通常就夠了。</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">
          我的庫存資料格式需要特別整理嗎？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">我們提供標準的 Google Sheets 範本，你只要照著格式填入現有的庫存、價目、產品資料即可。建置費包含格式教學，我們會手把手帶你完成。</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">
          升級方案怎麼計算費用？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">升級只補月費差額，建置費不重複收取。例如從基本查庫存版（$990/月）升級到外部使用版（$3,680/月），只需每月補 $2,690 差額，當月起生效。方案 1~2 升級至方案 3 以上，建置費 $6,000 同步免除。</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">
          方案 3~5 的建置費是怎麼算的？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">選擇方案 3（外部使用版）以上，建置費 $6,000 全部包含在內，不另外收取。方案 1~2 為輕量年繳型，建置費 $6,000 需另付一次。未來升級至方案 3 以上時，建置費不重複收取。</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">
          圖庫完整版的產品圖片怎麼管理？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">產品圖片儲存在 Google 雲端硬碟，依照系列和編號建立資料夾結構。新增圖片只要上傳到對應資料夾，系統自動讀取，不需要修改任何程式碼。</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="toggleFaq(this)">
          可以先從方案 1 試用，再升級嗎？
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-a">完全可以。從基本查庫存版（年繳 $9,900）開始，熟悉後隨時升級，只補差額。升級至方案 3 以上時，之前繳的建置費 $6,000 會從差額中扣除，不重複收取。</div>
      </div>
    </div>
  </div>
</section>

<!-- ── CTA ── -->
<section class="cta-section fade-in">
  <h2 class="cta-title">準備好讓業務效率翻倍了嗎？</h2>
  <p class="cta-desc">年繳最低 $9,900 起，方案 3 以上建置費全免。今天就開始，明天業務就能用。</p>
  <div class="cta-btns" style="flex-wrap:wrap;">
    <a href="mailto:titankou2002@gmail.com" class="btn-white">✉️ Email 專人聯繫</a>
    <a href="https://docs.google.com/forms/d/1is4oVl2bst0y-pzYKUOrMilu-LwKrmXzwZli4AzLQec/viewform" target="_blank" class="btn-outline-white">📝 填寫表單諮詢</a>
  </div>
</section>

<footer>
  <p>© 2026 磁磚 AI 智能客服系統 · 基於 LINE Messaging API & Google Apps Script 開發 · LINE 官方帳號費用由客戶自行申請</p>
</footer>

<script>
// ══════════════════════════════════════════════════════════
//  ▼▼▼  可編輯設定區 — 只需修改這裡，頁面自動更新  ▼▼▼
// ══════════════════════════════════════════════════════════
var PRICING_CONFIG = {

  // 建置費（一次性）
  setup: {
    price: 6000,
    items: ['Google 帳號建置', '雲端硬碟建置', 'LINE 官方帳號建置', '教育訓練']
  },

  // ──────────────────────────────────────────────────────────
  //  方案群組 — 修改價格只需改這裡
  //
  //  priceMode:
  //    'yearly'  → 大字顯示年繳金額，小字顯示月均
  //    'monthly' → 大字顯示月費，小字顯示年繳合計
  //
  //  setupIncluded:
  //    false → 顯示「建置費 $6,000 需另付」
  //    true  → 顯示「建置費 $6,000 已包含」（綠色）
  // ──────────────────────────────────────────────────────────
  groups: [
    {
      label: '輕量版 — 純年繳',
      sublabel: '',
      type: 'int',
      userBadge: '僅限內部員工',
      gridCols: 2,
      setupIncluded: false,
      plans: [
        {
          name: '基本查庫存版',
          tagline: '月繳 $990 · 年繳享折扣',
          priceMode: 'monthly',
          monthly: 990,
          yearly: 9900,
          highlight: false,
          inherited: null,
          features: [
            '查庫存（包含坪數、片數換算）',
            '缺貨回報'
          ]
        },
        {
          name: '業務基礎版',
          tagline: '業務日常查詢',
          priceMode: 'monthly',
          monthly: 1880,
          yearly: 19900,
          highlight: false,
          inherited: '含基本查庫存版全部',
          features: [
            '保留計算（庫存扣除保留量）',
            '保留明細查詢',
            '包裝明細查詢',
            '重量查詢',
            '價格查詢'
          ]
        }
      ]
    },
    {
      label: '完整版',
      sublabel: '年繳送建置費 $6,000',
      type: 'ext',
      userBadge: '內部＋外部客戶',
      gridCols: 3,
      setupIncluded: true,
      plans: [
        {
          name: '外部使用版',
          tagline: '開放外部客戶',
          priceMode: 'monthly',
          monthly: 3680,
          yearly: 3680 * 12,
          highlight: false,
          inherited: '含業務基礎版全部',
          features: [
            '外部客戶加入使用',
            '業務 ↔ 客戶分級權限',
            '客戶查詢限縮（僅見自己保留）',
            '到港時間提示'
          ]
        },
        {
          name: '圖庫完整版',
          tagline: '產品視覺展示',
          priceMode: 'monthly',
          monthly: 4680,
          yearly: 4680 * 12,
          highlight: true,      // 綠色框線推薦
          inherited: '含外部使用版全部',
          features: [
            'Flex 圖片輪播',
            '實景照展示',
            '單片磁磚圖查詢',
            '電子目錄下載',
            'Drive 圖庫建置',
            '替代產品推薦'
          ]
        },
        {
          name: 'AI 智能版',
          tagline: '自然語言 × 線上保留',
          priceMode: 'monthly',
          monthly: 5680,
          yearly: 5680 * 12,
          highlight: false,
          inherited: '含圖庫完整版全部',
          features: [
            'AI 自然語言對話',
            '條件搜尋（顏色、風格、坪數）',
            '線上保留單（LIFF 表單）',
            '多品項同時送出',
            '保留到期通知'
          ]
        }
      ]
    }
  ]
};
// ══════════════════════════════════════════════════════════
//  ▲▲▲  設定區結束  ▲▲▲
// ══════════════════════════════════════════════════════════

function renderPricing() {
  var cfg = PRICING_CONFIG;
  var mount = document.getElementById('pricing-groups-mount');
  if (!mount) return;

  var html = '';
  cfg.groups.forEach(function(group) {
    var gridClass = 'plan-grid-' + group.gridCols;
    html += '<div class="plan-group">';
    // Group header with sublabel
    html += '<div class="group-divider">';
    html += '<span class="group-tag ' + group.type + '">' + group.label + '</span>';
    if (group.sublabel) {
      html += '<span style="font-size:11px;color:' + (group.setupIncluded ? 'var(--green)' : 'var(--gray)') + ';margin-left:10px;">';
      html += (group.setupIncluded ? '🎁 ' : '⚠️ ') + group.sublabel + '</span>';
    }
    html += '<div class="group-line"></div>';
    html += '</div>';

    html += '<div class="' + gridClass + '">';
    group.plans.forEach(function(plan) {
      html += '<div class="plan-card' + (plan.highlight ? ' highlight' : '') + '">';
      html += '<div class="plan-name">' + plan.name + '</div>';
      html += '<div class="plan-tagline">' + plan.tagline + '</div>';
      html += '<div class="price-area">';

      if (plan.priceMode === 'yearly') {
        // Plan 1 style: big annual, small monthly equiv
        html += '<div class="price-monthly">$' + plan.yearly.toLocaleString() + ' <span>/ 年</span></div>';
        html += '<div class="price-yearly">相當於 $' + plan.monthly.toLocaleString() + ' / 月</div>';
      } else {
        // Plan 2–5 style: big monthly, annual total as sub
        html += '<div class="price-monthly">$' + plan.monthly.toLocaleString() + ' <span>/ 月</span></div>';
        html += '<div class="price-yearly">年繳 $' + plan.yearly.toLocaleString() + '</div>';
        var save = plan.monthly * 12 - plan.yearly;
        if (save > 0) html += '<div class="price-save">年繳省 $' + save.toLocaleString() + '</div>';
      }

      html += '</div>'; // price-area

      html += '<div class="plan-features">';
      if (plan.inherited) html += '<div class="pf inherited">' + plan.inherited + '</div>';
      plan.features.forEach(function(f) { html += '<div class="pf">' + f + '</div>'; });
      html += '</div>';

      html += '<div class="plan-users ' + group.type + '">' + group.userBadge + '</div>';
      html += '</div>'; // plan-card
    });
    html += '</div></div>'; // grid + plan-group
  });
  mount.innerHTML = html;

  // 同步更新建置費 Banner
  var setupFee = '$' + cfg.setup.price.toLocaleString();
  var titleEl = document.getElementById('setup-title');
  if (titleEl) titleEl.textContent = '建置費 ' + setupFee + '（方案 3~5 已包含，方案 1~2 需另付）';
  var priceEl = document.getElementById('setup-price-big');
  if (priceEl) priceEl.textContent = setupFee;
  var itemsEl = document.getElementById('setup-items');
  if (itemsEl) itemsEl.innerHTML = cfg.setup.items.map(function(i){ return '<div class="setup-item">' + i + '</div>'; }).join('');

  // 同步更新 Hero 統計數字
  var allPlans = cfg.groups.reduce(function(a, g){ return a.concat(g.plans); }, []);
  var minYearly = Math.min.apply(null, allPlans.map(function(p){ return p.yearly; }));
  var pcEl = document.getElementById('stat-plan-count');
  if (pcEl) pcEl.textContent = allPlans.length;
  var mpEl = document.getElementById('stat-min-price');
  if (mpEl) mpEl.textContent = '$' + minYearly.toLocaleString() + '/年';
  var sfEl = document.getElementById('stat-setup-fee');
  if (sfEl) sfEl.textContent = setupFee;
}

renderPricing();

// ──────────────────────────────────────────────
function toggleFaq(el) {
  const item = el.parentElement;
  item.classList.toggle('open');
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

function scrollToMsg(id) {
  const container = document.querySelector('.demo-msgs');
  const target = document.getElementById(id);
  if (container && target) {
    const topPos = target.offsetTop - container.offsetTop;
    container.scrollTo({ top: topPos - 20, behavior: 'smooth' });
    
    target.style.transition = 'transform 0.3s, filter 0.3s';
    target.style.transform = 'scale(1.02)';
    target.style.filter = 'brightness(1.05)';
    setTimeout(() => {
      target.style.transform = 'scale(1)';
      target.style.filter = 'brightness(1)';
    }, 400);
  }
}
</script>
</body>
</html>
