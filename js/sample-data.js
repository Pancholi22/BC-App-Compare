'use strict';

/* ---------- built-in example ---------- */
function sampleApps() {
  const man = v => `<Package xmlns="http://schemas.microsoft.com/navx/2015/manifest">
  <App Id="7d1c5a2e-0b44-4c8e-9a51-3f6f2a9c1d10" Name="Customer Loyalty" Publisher="Example Publisher" Version="${v}" Platform="1.0.0.0" Application="${v === '1.0.0.0' ? '25.0.0.0' : '26.0.0.0'}" Runtime="${v === '1.0.0.0' ? '14.0' : '15.0'}" Target="Cloud" ShowMyCode="True" />
  <IdRanges>
    <IdRange MinObjectId="50200" MaxObjectId="50249" />
  </IdRanges>
  <Dependencies />
  <Features>
    <Feature>NOIMPLICITWITH</Feature>${v === '1.0.0.0' ? '' : '\n    <Feature>TRANSLATIONFILE</Feature>'}
  </Features>
  <ResourceExposurePolicy AllowDebugging="true" AllowDownloadingSource="${v === '1.0.0.0' ? 'true' : 'false'}" IncludeSourceInSymbolFile="true" />
</Package>`;
  const fld = (Id, Name, T, cap) => ({ Id, Name, TypeDefinition: { Name: T }, Properties: [{ Name: 'Caption', Value: cap || Name }] });
  const meth = (Name, params, ret) => ({ Name, Parameters: params.map(([n, t, isVar]) => ({ Name: n, TypeDefinition: { Name: t }, IsVar: !!isVar })), ...(ret ? { ReturnTypeDefinition: { Name: ret } } : {}) });

  const tableV1 = `table 50200 "Loyalty Points Entry"
{
    Caption = 'Loyalty Points Entry';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Entry No."; Integer)
        {
            Caption = 'Entry No.';
            AutoIncrement = true;
        }
        field(2; "Customer No."; Code[20])
        {
            Caption = 'Customer No.';
            TableRelation = Customer;
        }
        field(3; "Posting Date"; Date)
        {
            Caption = 'Posting Date';
        }
        field(4; Points; Integer)
        {
            Caption = 'Points';
        }
    }

    keys
    {
        key(PK; "Entry No.")
        {
            Clustered = true;
        }
    }
}
`;
  const tableV2 = `table 50200 "Loyalty Points Entry"
{
    Caption = 'Loyalty Points Entry';
    DataClassification = CustomerContent;
    LookupPageId = "Loyalty Points Entries";

    fields
    {
        field(1; "Entry No."; Integer)
        {
            Caption = 'Entry No.';
            AutoIncrement = true;
        }
        field(2; "Customer No."; Code[20])
        {
            Caption = 'Customer No.';
            TableRelation = Customer;
        }
        field(3; "Posting Date"; Date)
        {
            Caption = 'Posting Date';
        }
        field(4; Points; Decimal)
        {
            Caption = 'Points';
            DecimalPlaces = 0 : 2;
        }
        field(5; "Source Document No."; Code[20])
        {
            Caption = 'Source Document No.';
        }
    }

    keys
    {
        key(PK; "Entry No.")
        {
            Clustered = true;
        }
        key(CustomerDate; "Customer No.", "Posting Date")
        {
            SumIndexFields = Points;
        }
    }
}
`;
  const cuV1 = `codeunit 50200 "Loyalty Mgt."
{
    procedure AwardPoints(CustomerNo: Code[20]; SalesAmount: Decimal)
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
    begin
        if SalesAmount <= 0 then
            exit;

        LoyaltyEntry.Init();
        LoyaltyEntry."Customer No." := CustomerNo;
        LoyaltyEntry."Posting Date" := WorkDate();
        LoyaltyEntry.Points := SalesAmount div 10;
        LoyaltyEntry.Insert(true);
    end;

    procedure GetBalance(CustomerNo: Code[20]): Integer
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
    begin
        LoyaltyEntry.SetRange("Customer No.", CustomerNo);
        LoyaltyEntry.CalcSums(Points);
        exit(LoyaltyEntry.Points);
    end;
}
`;
  const cuV2 = `codeunit 50200 "Loyalty Mgt."
{
    procedure AwardPoints(CustomerNo: Code[20]; SalesAmount: Decimal; DocumentNo: Code[20])
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
    begin
        if SalesAmount <= 0 then
            exit;

        LoyaltyEntry.Init();
        LoyaltyEntry."Customer No." := CustomerNo;
        LoyaltyEntry."Posting Date" := WorkDate();
        LoyaltyEntry.Points := Round(SalesAmount / 10, 0.01);
        LoyaltyEntry."Source Document No." := DocumentNo;
        LoyaltyEntry.Insert(true);
    end;

    procedure GetBalance(CustomerNo: Code[20]): Decimal
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
    begin
        LoyaltyEntry.SetRange("Customer No.", CustomerNo);
        LoyaltyEntry.CalcSums(Points);
        exit(LoyaltyEntry.Points);
    end;

    procedure RedeemPoints(CustomerNo: Code[20]; PointsToRedeem: Decimal)
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
        NotEnoughPointsErr: Label 'Customer %1 has only %2 points.', Comment = '%1 = Customer No., %2 = Balance';
    begin
        if GetBalance(CustomerNo) < PointsToRedeem then
            Error(NotEnoughPointsErr, CustomerNo, GetBalance(CustomerNo));

        LoyaltyEntry.Init();
        LoyaltyEntry."Customer No." := CustomerNo;
        LoyaltyEntry."Posting Date" := WorkDate();
        LoyaltyEntry.Points := -PointsToRedeem;
        LoyaltyEntry.Insert(true);
    end;
}
`;
  const page = extra => `page 50200 "Loyalty Points Entries"
{
    PageType = List;
    ApplicationArea = All;
    UsageCategory = History;
    SourceTable = "Loyalty Points Entry";
    Editable = false;

    layout
    {
        area(Content)
        {
            repeater(Entries)
            {
                field("Entry No."; Rec."Entry No.") { }
                field("Customer No."; Rec."Customer No.") { }
                field("Posting Date"; Rec."Posting Date") { }
                field(Points; Rec.Points) { }${extra ? '\n                field("Source Document No."; Rec."Source Document No.") { }' : ''}
            }
        }
    }
}
`;
  const legacy = `codeunit 50201 "Loyalty Legacy Import"
{
    procedure ImportFromCsv(var InStr: InStream)
    var
        LoyaltyEntry: Record "Loyalty Points Entry";
        Line: Text;
    begin
        while not InStr.EOS do begin
            InStr.ReadText(Line);
            // TODO: parse the old loyalty CSV export
        end;
    end;
}
`;
  const install = `codeunit 50202 "Loyalty Install"
{
    Subtype = Install;

    trigger OnInstallAppPerCompany()
    begin
        // nothing to initialise yet
    end;
}
`;
  const ext = v2 => `tableextension 50200 "Loyalty Customer" extends Customer
{
    fields
    {
        field(50200; "Loyalty Tier"; ${v2 ? 'Enum "Loyalty Tier"' : 'Code[10]'})
        {
            Caption = 'Loyalty Tier';
            DataClassification = CustomerContent;
        }
    }
}
`;
  const tierEnum = `enum 50200 "Loyalty Tier"
{
    Extensible = true;

    value(0; Bronze) { Caption = 'Bronze'; }
    value(1; Silver) { Caption = 'Silver'; }
    value(2; Gold) { Caption = 'Gold'; }
}
`;
  const perm = v2 => `permissionset 50200 "LOYALTY"
{
    Assignable = true;
    Caption = 'Customer Loyalty';
    Permissions = tabledata "Loyalty Points Entry" = RIMD,
        table "Loyalty Points Entry" = X,
        codeunit "Loyalty Mgt." = X,${v2 ? '' : '\n        codeunit "Loyalty Legacy Import" = X,'}
        page "Loyalty Points Entries" = X;
}
`;
  const sym1 = {
    Tables: [{ Id: 50200, Name: 'Loyalty Points Entry', Properties: [{ Name: 'DataClassification', Value: 'CustomerContent' }],
      Fields: [fld(1, 'Entry No.', 'Integer'), fld(2, 'Customer No.', 'Code[20]'), fld(3, 'Posting Date', 'Date'), fld(4, 'Points', 'Integer')],
      Keys: [{ Name: 'PK', FieldNames: ['Entry No.'] }] }],
    Codeunits: [{ Id: 50200, Name: 'Loyalty Mgt.', Methods: [meth('AwardPoints', [['CustomerNo', 'Code[20]'], ['SalesAmount', 'Decimal']]), meth('GetBalance', [['CustomerNo', 'Code[20]']], 'Integer')] },
      { Id: 50201, Name: 'Loyalty Legacy Import', Methods: [meth('ImportFromCsv', [['InStr', 'InStream', true]])] },
      { Id: 50202, Name: 'Loyalty Install', Properties: [{ Name: 'Subtype', Value: 'Install' }] }],
    Pages: [{ Id: 50200, Name: 'Loyalty Points Entries', Properties: [{ Name: 'PageType', Value: 'List' }, { Name: 'SourceTable', Value: 'Loyalty Points Entry' }],
      Controls: [{ Name: 'Content', Controls: [{ Name: 'Entries', Controls: ['Entry No.', 'Customer No.', 'Posting Date', 'Points'].map(n => ({ Name: n })) }] }] }],
    TableExtensions: [{ Id: 50200, Name: 'Loyalty Customer', Fields: [fld(50200, 'Loyalty Tier', 'Code[10]')] }],
    PermissionSets: [{ Id: 50200, Name: 'LOYALTY' }]
  };
  const sym2 = JSON.parse(JSON.stringify(sym1));
  const t2 = sym2.Tables[0];
  t2.Properties.push({ Name: 'LookupPageId', Value: 'Loyalty Points Entries' });
  t2.Fields[3] = { ...fld(4, 'Points', 'Decimal'), Properties: [{ Name: 'Caption', Value: 'Points' }, { Name: 'DecimalPlaces', Value: '0 : 2' }] };
  t2.Fields.push(fld(5, 'Source Document No.', 'Code[20]'));
  t2.Keys.push({ Name: 'CustomerDate', FieldNames: ['Customer No.', 'Posting Date'] });
  sym2.Codeunits = [{ Id: 50200, Name: 'Loyalty Mgt.', Methods: [meth('AwardPoints', [['CustomerNo', 'Code[20]'], ['SalesAmount', 'Decimal'], ['DocumentNo', 'Code[20]']]), meth('GetBalance', [['CustomerNo', 'Code[20]']], 'Decimal'), meth('RedeemPoints', [['CustomerNo', 'Code[20]'], ['PointsToRedeem', 'Decimal']])] }, sym1.Codeunits[2]];
  sym2.Pages[0].Controls[0].Controls[0].Controls.push({ Name: 'Source Document No.' });
  sym2.TableExtensions[0].Fields[0].TypeDefinition = { Name: 'Enum', Subtype: { Name: 'Loyalty Tier' } };
  sym2.EnumTypes = [{ Id: 50200, Name: 'Loyalty Tier', Values: [{ Id: 0, Name: 'Bronze' }, { Id: 1, Name: 'Silver' }, { Id: 2, Name: 'Gold' }] }];

  const f = (path, data) => ({ path, bin: false, data });
  const left = buildApp('Example Publisher_Customer Loyalty_1.0.0.0.app', [
    f('NavxManifest.xml', man('1.0.0.0')), f('SymbolReference.json', JSON.stringify(sym1)),
    f('src/Tables/LoyaltyPointsEntry.Table.al', tableV1), f('src/Pages/LoyaltyPointsEntries.Page.al', page(false)),
    f('src/Codeunits/LoyaltyMgt.Codeunit.al', cuV1), f('src/Codeunits/LoyaltyLegacyImport.Codeunit.al', legacy),
    f('src/Codeunits/LoyaltyInstall.Codeunit.al', install), f('src/TableExtensions/LoyaltyCustomer.TableExt.al', ext(false)),
    f('src/PermissionSets/Loyalty.PermissionSet.al', perm(false))
  ]);
  const right = buildApp('Example Publisher_Customer Loyalty_1.1.0.0.app', [
    f('NavxManifest.xml', man('1.1.0.0')), f('SymbolReference.json', JSON.stringify(sym2)),
    f('src/Tables/LoyaltyPointsEntry.Table.al', tableV2), f('src/Pages/LoyaltyPointsEntries.Page.al', page(true)),
    f('src/Codeunits/LoyaltyMgt.Codeunit.al', cuV2), f('src/Codeunits/LoyaltyInstall.Codeunit.al', install),
    f('src/TableExtensions/LoyaltyCustomer.TableExt.al', ext(true)), f('src/Enums/LoyaltyTier.Enum.al', tierEnum),
    f('src/PermissionSets/Loyalty.PermissionSet.al', perm(true))
  ]);
  return [left, right];
}
