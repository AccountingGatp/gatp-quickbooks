export const metadata = { title: "Privacy policy" };
export default function Privacy() {
  return (
    <main className="mx-auto max-w-[68ch] px-6 py-14 text-[15px] leading-relaxed text-ink-2">
      <h1 className="mb-4 text-[26px] font-semibold text-ink">Privacy policy</h1>
      <p>GATP Ledger is an internal tool of GATP Solutions, used by its staff to import, export and delete accounting records in QuickBooks Online companies of GATP’s clients.</p>
      <h2 className="mt-6 mb-2 text-[17px] font-semibold text-ink">What is stored</h2>
      <p>Files uploaded for import, the checks made on them, the results of posting, and a log of who did what. QuickBooks connection tokens are stored encrypted. Records removed with bulk delete are kept as a backup. Data is stored in GATP’s MongoDB database and is used only to provide this service.</p>
      <h2 className="mt-6 mb-2 text-[17px] font-semibold text-ink">Sharing</h2>
      <p>Data is not sold or shared with anyone outside GATP Solutions, except QuickBooks Online (Intuit), which receives the records you post.</p>
      <h2 className="mt-6 mb-2 text-[17px] font-semibold text-ink">Disconnecting</h2>
      <p>A company can be disconnected at any time from the Companies page or from QuickBooks Online (Apps → Connected apps). Questions: accounting@gatpsolutions.com.</p>
    </main>
  );
}
