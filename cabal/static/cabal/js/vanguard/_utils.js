// /plugins/Cabal/cabal/static/cabal/js/vanguard/_utils.js

const btnAlertSelected = document.getElementById('btn-alert-selected');
const clearPacksBtn = document.getElementById('btn-clear-packs');
const container = document.getElementById('recommendations-container');
const listContainer = document.getElementById('recommendations-list');
const lookupPacksBtn = document.getElementById('btn-lookup-packs');
const packsTextarea = document.getElementById('packs');

const clearDateBtn = document.getElementById('btn-clear-date-filter');
const clearFilterBtn = document.getElementById('btn-clear-ipn-filter');
const dateFilterInput = document.getElementById('ipn-date-filter');
const filterInput = document.getElementById('ipn-filter-input');
const ipnTextarea = document.getElementById('ipn_list');
const lookupDateBtn = document.getElementById('btn-lookup-date');
const lookupDateInput = document.getElementById('lookup_date');
const packs = document.getElementById('packs');
const sortBtn = document.getElementById('btn-sort-ipn');
const subBoxPulls = document.getElementById('sub_box_pulls');

const STORAGE_IPN_CONTENT_KEY = 'vanguard_ipn_content_v1';
const STORAGE_KEY = 'vanguard_ipn_timestamps_v1';
const STORAGE_PACKS_CONTENT_KEY = 'vanguard_packs_content_v1';
