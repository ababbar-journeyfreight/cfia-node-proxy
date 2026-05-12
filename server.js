const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});


app.get('/cfia', async (req, res) => {
  const omic = req.query.omic;

  if (!omic) {
    return res.status(400).json({ error: 'Missing omic parameter' });
  }

  try {
    const url = 'https://shipmenttracker-suividesenvois.inspection.canada.ca/service/english/common/shipmenttracker.aspx';

    // STEP 1: First GET to get VIEWSTATE etc. (with browser-like headers)
    const initialResponse = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
      withCredentials: true
    });

    const cookies = initialResponse.headers['set-cookie'];
    const html = initialResponse.data;
    const $ = cheerio.load(html);

    const viewState = $('#__VIEWSTATE').val();
    const eventValidation = $('#__EVENTVALIDATION').val();
    const viewStateGen = $('#__VIEWSTATEGENERATOR').val();

    if (!viewState || !eventValidation || !viewStateGen) {
      return res.status(500).json({
        error: 'Failed to extract VIEWSTATE fields',
        debug: { viewState: !!viewState, eventValidation: !!eventValidation, viewStateGen: !!viewStateGen }
      });
    }

    // STEP 2: POST with form data
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('__VIEWSTATEGENERATOR', viewStateGen);
    formData.append('ctl00$MainBody$uxOMIC', omic);
    formData.append('ctl00$MainBody$uxSearch', 'Search');

    const postResponse = await axios.post(url, formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies ? cookies.join('; ') : ''
      }
    });

    const resultHtml = postResponse.data;
    const $$ = cheerio.load(resultHtml);

    const tds = [];
    $$('td').each((i, el) => {
      tds.push($$(el).text().trim());
    });

    if (tds.length < 4) {
      return res.status(500).json({
        error: 'Could not parse CFIA response',
        debugSample: tds.slice(0, 10)
      });
    }

    const output = {
      omic: tds[0],
      controlNumber: tds[1],
      inspectionRequired: tds[2],
      establishmentNumber: tds[3]
    };

    return res.json(output);

  } catch (err) {
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.send('CFIA Node proxy is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
