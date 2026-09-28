# Built-in PII policy semantics

Status: active for `redactguard-detection-v2`  
Owner: RedactGuard privacy-policy layer

## Principle

RedactGuard built-in profiles are **data-minimization policies**, not universal legal
definitions of personal data.

A value can therefore be treated as sensitive because of the context in which it
appears, even when the same value may be public elsewhere. The model must follow the
active profile definition rather than infer legal status from the value alone.

Custom organization-defined PII types may override or extend these defaults.

## Policy classes

### Always sensitive in the matching profile

Examples:

- personal names;
- personal email addresses and phone numbers;
- residential addresses;
- fiscal codes and personal identifiers;
- IBAN/account/card identifiers;
- credentials and secrets;
- health information in Healthcare.

### Contextually sensitive

These values are detected when they identify, link, or describe a person, party,
customer, supplier, account, transaction, contract, case, or other protected record in
the active domain:

- business VAT/tax identifiers inside customer/supplier/account/legal records;
- invoice, customer, policy, case, contract, and record identifiers;
- business or shared contact addresses when they are the contact field of a protected
  customer/supplier/party record;
- transaction, contract, filing, visit, or other record-specific dates;
- cities/locations when they are part of a party/customer/address field.

A value being publicly discoverable elsewhere does not automatically exclude it when
the active profile explicitly classifies that record field as sensitive.

### Not included by the built-in policy unless configured separately

- organization names by themselves;
- monetary amounts by themselves;
- generic public facts not linked to a protected record;
- generic locations with no person/party/customer/account context.

Organizations that want these categories redacted should add explicit custom PII
definitions.

## Financial profile clarifications

`account_number` includes:

- bank accounts and IBANs;
- card/policy/account identifiers;
- fiscal codes;
- VAT/tax identifiers when present as a customer/supplier/account record identifier;
- customer, invoice, transaction, or record identifiers when they link a financial
  record to a person/party/account.

`private_email`, `private_phone`, and `private_address` include contact/location
fields attached to a customer, supplier, beneficiary, account holder, or other party in
the financial record, including shared business contact values when the record policy
treats that party record as sensitive.

## Legal profile clarifications

`account_number` includes fiscal/VAT identifiers, case numbers, contract identifiers,
filing/document references, and comparable record identifiers when they identify or
link a party or protected legal record.

Registered-office/contact fields may be treated as sensitive when they are part of a
protected party record, even if the same information is public in another context.

## Benchmark implication

Benchmark gold must follow this policy. A gold label is not valid merely because a
pattern matches; it must also satisfy the profile/context rule above.

Conversely, benchmark data must not remove a gold label simply because a tested model
missed it.

The realistic benchmark remains deterministic and not independently human-reviewed
until its annotations have been checked against this policy.
