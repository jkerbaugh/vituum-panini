export default function (parameters, options ) {
    
    const items = parameters.split(/[,]+/).filter(Boolean).map((item, index) => {
        return options.fn(item, { data: { ["index"]: (index) } })
    }).join('\n');
    return items;
}