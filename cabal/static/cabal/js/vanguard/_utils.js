// /plugins/Cabal/cabal/static/cabal/js/vanguard/_utils.js

const container = document.getElementById('recommendations-container');
const listContainer = document.getElementById('recommendations-list');
const btnAlertSelected = document.getElementById('btn-alert-selected');
const packsTextarea = document.getElementById('packs');
const clearPacksBtn = document.getElementById('btn-clear-packs');
const lookupPacksBtn = document.getElementById('btn-lookup-packs');

const ipnTextarea = document.getElementById('ipn_list');
const sortBtn = document.getElementById('btn-sort-ipn');
const filterInput = document.getElementById('ipn-filter-input');
const clearFilterBtn = document.getElementById('btn-clear-ipn-filter');
const dateFilterInput = document.getElementById('ipn-date-filter');
const clearDateBtn = document.getElementById('btn-clear-date-filter');
const lookupDateInput = document.getElementById('lookup_date');
const lookupDateBtn = document.getElementById('btn-lookup-date');

const STORAGE_KEY = 'vanguard_ipn_timestamps_v1';
const STORAGE_IPN_CONTENT_KEY = 'vanguard_ipn_content_v1';
const STORAGE_PACKS_CONTENT_KEY = 'vanguard_packs_content_v1';
