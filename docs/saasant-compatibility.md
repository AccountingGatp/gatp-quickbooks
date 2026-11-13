# SaasAnt Transactions Online compatibility

The GATP visual design, branding, URLs and internal transaction keys remain unchanged. Public SaasAnt documentation supplies user-facing transaction names, import terminology and documented setting behavior. These names do not imply full product parity.

## Implemented

| Area | GATP behavior |
| --- | --- |
| Names | New Import, Select QuickBooks Entity, File Header, QuickBooks Field, Mapping, Preview Mapping, Import to QuickBooks, Import Settings, Modify and Undo. Transaction/list labels follow the supported-entity reference. |
| Mapping | Actual spreadsheet headers and samples map to fields for the chosen entity. Saved matching remains scoped to entity and layout; unrelated types cannot leak into the mapping. |
| Bank Statements | Date, Description, Check No, Payee, Bank Account, Account, Amount, Debit Amount, Credit Amount and Transaction Type. Positive means incoming funds; negative means outgoing. GATP also supports explicit linked-payment IDs and bill numbers. |
| Reference numbers | File reference numbers can be retained. |
| Missing names | Auto-create vendors, customers, classes, locations and payment methods when enabled. Missing accounts/products are held for setup. |
| Individual transactions | An optional setting stops grouping repeated document numbers. Each row must independently contain required data. Modify rejects this setting to preserve complete replacements. |
| Zero amounts | Optional skipping of zero-value transactions before names are created. Balanced journals with nonzero lines remain intact. Disabling the setting rechecks rows skipped for zero amounts. |
| Negative amounts | Optional conversion of explicit negative Expense Line Amount values for Expense and Checks imports. Signed Bank/Credit Card Statements and invoice adjustments keep their direction/signs. |
| Text limits | Optional truncation with a warning. When disabled, overlong values block import instead of being cut. |
| Modify | Limited to previously reviewed invoice/credit memo updates; preserves IDs, backs up originals, refuses newer edits and restores originals on undo. |
| Results/recovery | Row errors, downloadable results, existing-record links, duplicate detection, immutable posting requests, company/job locks and undo safeguards. |

## Still not equivalent

- Modify for expenses, checks and other bank transactions is not implemented. Bank Statements imports create accounting records, not pending QuickBooks bank-feed matches.
- PDF/image OCR, IIF parsing, attachments, budgets, general ledger and inventory adjustments are not implemented.
- Mapping formulas, all custom/tax fields, invoice/credit-note conversion, automatic product/account defaults and unattended automation are not implemented.
- Multi-file queueing, email reports, one-click import and the full set of duplicate/name matching settings are not implemented.
- Live tests of newly added transaction mutations require explicit permission and sufficient supporting records in Test Company.

## Verification

Run `npm test`, `npm run typecheck` and `npm run build`. Regression tests cover old setting defaults, boolean input validation, line grouping, missing continuation identities, zero skipping/rechecking, journal preservation, expense-sign conversion, statement-sign preservation and text-limit enforcement. Recovery tests cover lost responses, backup persistence and stale versions.

## Official references

- [Import workflow](https://support.saasant.com/support/solutions/articles/14000124091-how-to-import-transactions-into-quickbooks-online-from-saasant-transactions-online-/)
- [Import settings](https://support.saasant.com/support/solutions/articles/14000053047-import-settings-in-saasant-transactions-online-/)
- [Supported QuickBooks Online entities](https://support.saasant.com/support/solutions/articles/supported-quickbooks-online-transactions-and-lists/)
- [Bank Statement fields and sign conventions](https://support.saasant.com/support/solutions/articles/14000085604-how-to-import-bank-statements-into-quickbooks-online-uk-au-ca-in-fr-other-regions-/)

Documentation differs by release and QuickBooks region. Screenshots of the user's SaasAnt entity selector, bank mapping, import settings and results can resolve version-specific wording while preserving GATP's design.
