const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const http = require('http');
const https = require('https');
const axiosRetry = require('axios-retry').default;

const app = express();
const PORT = process.env.PORT || 3000;

// AXIOS INSTANCE (stable) 

const axiosInstance = axios.create({
  timeout: 20000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});

// RETRY LOGIC 
axiosRetry(axiosInstance, {
  retries: 3,
  retryDelay: (count) => count * 2000,
  retryCondition: (err) =>
    axiosRetry.isNetworkError(err) ||
    axiosRetry.isRetryableError(err)
});

// HEADERS (browser-like) 
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive'
};

// UTIL: extract ASP.NET fields 
function extractFields($) {
  return {
    viewState: $('#__VIEWSTATE').val(),
    eventValidation: $('#__EVENTVALIDATION').val(),
    viewStateGen: $('#__VIEWSTATEGENERATOR').val()
  };
}

// ROOT 
app.get('/', (req, res) => {
  res.send('CFIA API running');
});

// PING

app.get('/ping', (req, res) => {
  res.send('OK');
});

// MAIN API TEST: http://localhost:3000/cfia?omic=US1420117


app.get('/cfia', async (req, res) => {
  const omic = req.query.omic;

  if (!omic) {
    return res.status(400).json({ error: 'Missing omic parameter' });
  }


  try {
    const url =
      'https://shipmenttracker-suividesenvois.inspection.canada.ca/service/english/common/shipmenttracker.aspx';

    // STEP 1: GET PAGE
    const first = await axiosInstance.get(url, { headers });

    const $ = cheerio.load(first.data);
    const cookies = first.headers['set-cookie'];

    const { viewState, eventValidation, viewStateGen } = extractFields($);

    if (!viewState || !eventValidation || !viewStateGen) {
      return res.status(500).json({
        error: 'Failed to extract VIEWSTATE fields'
      });
    }

    // STEP 2: POST FORM
    const form = new URLSearchParams();
    form.append('__VIEWSTATE', viewState);
    form.append('__EVENTVALIDATION', eventValidation);
    form.append('__VIEWSTATEGENERATOR', viewStateGen);
    form.append('ctl00$MainBody$uxOMIC', omic);
    form.append('ctl00$MainBody$uxSearch', 'Search');

    const second = await axiosInstance.post(url, form.toString(), {
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies ? cookies.join('; ') : ''
      }
    });

    // STEP 3: PARSE RESULT
    const $$ = cheerio.load(second.data);

    const rows = [];

    $$('table tr').each((i, tr) => {
      const cols = [];
      $$(tr)
        .find('td')
        .each((j, td) => {
          cols.push($$(td).text().trim());
        });

      if (cols.length) rows.push(cols);
    });

    const row = rows.find(r => r.length >= 4);

    if (!row) {
      return res.status(404).json({
        error: 'No shipment found for this OMIC',
        omic
      });
    }

    const result = {
      omic: row[0] || null,
      controlNumber: row[1] || null,
      inspectionRequired: row[2] || null,
      establishmentNumber: row[3] || null,
      fetchedAt: new Date().toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + 'ET'
    };


    return res.json({
      source: 'cfia',
      ...result
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
