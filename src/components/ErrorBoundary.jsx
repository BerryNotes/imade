import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("React crash:", error, info.componentStack); }
  render() {
    if (this.state.error) return React.createElement("div", {style:{padding:40,textAlign:"center"}},
      React.createElement("h2", {style:{color:"#ef4444"}}, "Something crashed"),
      React.createElement("pre", {style:{color:"#e2e8f0",fontSize:12,textAlign:"left",background:"#14142a",padding:16,borderRadius:8,overflow:"auto",maxHeight:300,marginTop:16}}, String(this.state.error) + "\n" + (this.state.error?.stack || "")),
      React.createElement("button", {onClick:()=>this.setState({error:null}),style:{marginTop:16,padding:"10px 20px",borderRadius:8,background:"#4338ca",border:"none",color:"#fff",cursor:"pointer"}}, "Try to recover")
    );
    return this.props.children;
  }
}

export default ErrorBoundary;
