fetch("https://script.googleapis.com/discovery/v1/apis/script/v1/rest")
  .then(r => r.json())
  .then(d => {
    const m = d.resources.projects.resources.versions.methods;
    console.log(JSON.stringify(m, null, 2));
  });
